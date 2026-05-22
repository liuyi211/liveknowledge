import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import type { FastifyBaseLogger } from 'fastify';
import {
  cardReviews,
  cards,
  chatSessions,
  concepts,
  domainMastery,
  messages,
  userProfiles,
  weakPoints,
} from '../db/schema.js';

type ProfileRow = typeof userProfiles.$inferSelect;
type DomainMasteryRow = typeof domainMastery.$inferSelect;
type WeakPointRow = typeof weakPoints.$inferSelect;

interface ProfileStats {
  messageCount: number;
  userMessageCount: number;
  avgUserMessageLength: number;
  sessionCount: number;
  cardCount: number;
  reviewCount: number;
  recallRate: number | null;
  againRate: number | null;
  hardRate: number | null;
  avgResponseTimeMs: number | null;
  avgHalfLife: number | null;
  avgDifficulty: number | null;
  avgRetrievability: number | null;
  lapsedCardCount: number;
  masteredCardCount: number;
  domainCount: number;
  weakPointCount: number;
}

interface DomainAggregate {
  domain: string;
  cardsTotal: number;
  cardsMastered: number;
  avgRetrievability: number;
  avgHalfLife: number;
  avgDifficulty: number;
  reviewCount: number;
  rememberedCount: number;
  lastStudied: Date | null;
}

interface WeakPointAggregate {
  conceptAId: string | null;
  conceptALabel: string;
  confusionCount: number;
  avgRetrievability: number;
  maxLapseCount: number;
  lastConfused: Date;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function rowsOf<T>(result: unknown): T[] {
  return ((result as any).rows || result || []) as T[];
}

function scoreVolume(value: number, target: number): number {
  if (target <= 0) return 0;
  return clamp(value / target, 0, 1);
}

function calculateConfidence(stats: ProfileStats): number {
  const messageSignal = scoreVolume(stats.userMessageCount, 40) * 0.25;
  const reviewSignal = scoreVolume(stats.reviewCount, 80) * 0.35;
  const cardSignal = scoreVolume(stats.cardCount, 50) * 0.25;
  const domainSignal = scoreVolume(stats.domainCount, 6) * 0.15;
  return round(clamp(messageSignal + reviewSignal + cardSignal + domainSignal, 0, 1));
}

function calculateProfile(stats: ProfileStats) {
  const recallRate = stats.recallRate ?? 0.75;
  const againRate = stats.againRate ?? 0.12;
  const hardRate = stats.hardRate ?? 0.18;
  const avgResponseTimeMs = stats.avgResponseTimeMs ?? 12000;
  const avgHalfLife = stats.avgHalfLife ?? 1;
  const avgDifficulty = stats.avgDifficulty ?? 6;
  const avgRetrievability = stats.avgRetrievability ?? 0.8;

  const styleConcise = clamp((80 - stats.avgUserMessageLength) / 80, -1, 1);
  const styleGradual = clamp((againRate * 1.2 + hardRate * 0.6 + (avgDifficulty - 8) / 10) * 2 - 0.4, -1, 1);
  const styleIntuitive = clamp((hardRate + againRate - 0.25) * 2, -1, 1);
  const styleVisual = clamp(stats.domainCount > 0 ? 0.1 : 0, -1, 1);
  const attentionSpan = Math.round(clamp(avgResponseTimeMs / 1000 / 60 * 8 + 20, 15, 60));
  const optimalSessionLength = Math.round(clamp(20 + stats.sessionCount * 0.5 + stats.reviewCount / 20, 20, 60));
  const memoryStabilityFactor = clamp(avgHalfLife / 5, 0.2, 3);
  const memoryRetrievabilityThreshold = clamp(0.72 + againRate * 0.35 + hardRate * 0.15, 0.65, 0.95);
  const preferredDifficulty = clamp(avgDifficulty + (recallRate - 0.75) * 2 - (1 - avgRetrievability), 1, 18);

  return {
    styleVisual: round(styleVisual),
    styleIntuitive: round(styleIntuitive),
    styleGradual: round(styleGradual),
    styleConcise: round(styleConcise),
    attentionSpan,
    optimalSessionLength,
    preferredDifficulty: round(preferredDifficulty),
    memoryStabilityFactor: round(memoryStabilityFactor),
    memoryRetrievabilityThreshold: round(memoryRetrievabilityThreshold),
    confidence: calculateConfidence(stats),
  };
}

function calculateMastery(row: DomainAggregate): number {
  const recallRate = row.reviewCount > 0 ? row.rememberedCount / row.reviewCount : 0.5;
  const retrievability = clamp(row.avgRetrievability, 0, 1);
  const coverage = scoreVolume(row.cardsTotal, 12);
  const halfLifeSignal = scoreVolume(row.avgHalfLife, 14);
  const difficultyPenalty = clamp((row.avgDifficulty - 8) / 18, 0, 0.25);
  return Math.round(clamp(
    recallRate * 45 +
    retrievability * 25 +
    coverage * 15 +
    halfLifeSignal * 15 -
    difficultyPenalty * 100,
    0,
    100
  ));
}

async function getProfileStats(userId: string): Promise<ProfileStats> {
  const [messageStats] = await db.select({
    messageCount: sql<number>`count(*)::int`,
    userMessageCount: sql<number>`count(*) FILTER (WHERE ${messages.role} = 'user')::int`,
    avgUserMessageLength: sql<number>`coalesce(avg(length(${messages.content})) FILTER (WHERE ${messages.role} = 'user'), 0)::float`,
  })
    .from(messages)
    .innerJoin(chatSessions, eq(chatSessions.id, messages.sessionId))
    .where(eq(chatSessions.userId, userId));

  const [sessionStats] = await db.select({ sessionCount: sql<number>`count(*)::int` })
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId));

  const [cardStats] = await db.select({
    cardCount: sql<number>`count(*)::int`,
    avgHalfLife: sql<number>`coalesce(avg(${cards.halfLife}), 0)::float`,
    avgDifficulty: sql<number>`coalesce(avg(${cards.difficulty}), 0)::float`,
    avgRetrievability: sql<number>`coalesce(avg(${cards.retrievability}), 0)::float`,
    lapsedCardCount: sql<number>`count(*) FILTER (WHERE ${cards.lapseCount} > 0)::int`,
    masteredCardCount: sql<number>`count(*) FILTER (WHERE ${cards.reviewCount} > 0 AND ${cards.retrievability} >= 0.85 AND ${cards.lapseCount} = 0)::int`,
  })
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.suspended, false)));

  const [reviewStats] = await db.select({
    reviewCount: sql<number>`count(*)::int`,
    rememberedCount: sql<number>`count(*) FILTER (WHERE ${cardReviews.rating} IN (2, 3, 4))::int`,
    againCount: sql<number>`count(*) FILTER (WHERE ${cardReviews.rating} = 1)::int`,
    hardCount: sql<number>`count(*) FILTER (WHERE ${cardReviews.rating} = 2)::int`,
    avgResponseTimeMs: sql<number>`coalesce(avg(${cardReviews.responseTimeMs}), 0)::float`,
  })
    .from(cardReviews)
    .where(eq(cardReviews.userId, userId));

  const [domainCount] = await db.select({ value: sql<number>`count(distinct coalesce(${concepts.domain}, '未分类'))::int` })
    .from(concepts)
    .where(eq(concepts.userId, userId));

  const reviewCount = Number(reviewStats?.reviewCount ?? 0);

  return {
    messageCount: Number(messageStats?.messageCount ?? 0),
    userMessageCount: Number(messageStats?.userMessageCount ?? 0),
    avgUserMessageLength: Number(messageStats?.avgUserMessageLength ?? 0),
    sessionCount: Number(sessionStats?.sessionCount ?? 0),
    cardCount: Number(cardStats?.cardCount ?? 0),
    reviewCount,
    recallRate: reviewCount > 0 ? Number(reviewStats?.rememberedCount ?? 0) / reviewCount : null,
    againRate: reviewCount > 0 ? Number(reviewStats?.againCount ?? 0) / reviewCount : null,
    hardRate: reviewCount > 0 ? Number(reviewStats?.hardCount ?? 0) / reviewCount : null,
    avgResponseTimeMs: reviewCount > 0 ? Number(reviewStats?.avgResponseTimeMs ?? 0) : null,
    avgHalfLife: Number(cardStats?.cardCount ?? 0) > 0 ? Number(cardStats?.avgHalfLife ?? 0) : null,
    avgDifficulty: Number(cardStats?.cardCount ?? 0) > 0 ? Number(cardStats?.avgDifficulty ?? 0) : null,
    avgRetrievability: Number(cardStats?.cardCount ?? 0) > 0 ? Number(cardStats?.avgRetrievability ?? 0) : null,
    lapsedCardCount: Number(cardStats?.lapsedCardCount ?? 0),
    masteredCardCount: Number(cardStats?.masteredCardCount ?? 0),
    domainCount: Number(domainCount?.value ?? 0),
    weakPointCount: 0,
  };
}

async function getDomainAggregates(userId: string): Promise<DomainAggregate[]> {
  const result = await db.execute(sql`
    SELECT
      coalesce(nullif(cn.domain, ''), '未分类') AS domain,
      count(distinct c.id)::int AS cards_total,
      count(distinct c.id) FILTER (
        WHERE c.review_count > 0
          AND c.retrievability >= 0.85
          AND c.lapse_count = 0
      )::int AS cards_mastered,
      coalesce(avg(c.retrievability), 0)::float AS avg_retrievability,
      coalesce(avg(c.half_life), 0)::float AS avg_half_life,
      coalesce(avg(c.difficulty), 0)::float AS avg_difficulty,
      count(cr.id)::int AS review_count,
      count(cr.id) FILTER (WHERE cr.rating IN (2, 3, 4))::int AS remembered_count,
      max(coalesce(cr.reviewed_at, c.last_reviewed_at, c.updated_at, c.created_at)) AS last_studied
    FROM card_concepts cc
    INNER JOIN concepts cn ON cn.id = cc.concept_id
    INNER JOIN cards c ON c.id = cc.card_id
    LEFT JOIN card_reviews cr ON cr.card_id = c.id AND cr.user_id = ${userId}
    WHERE cc.user_id = ${userId}
      AND c.user_id = ${userId}
      AND c.suspended = false
    GROUP BY coalesce(nullif(cn.domain, ''), '未分类')
    ORDER BY cards_total DESC, domain ASC
  `);

  return rowsOf<any>(result).map(row => ({
    domain: String(row.domain),
    cardsTotal: Number(row.cards_total ?? 0),
    cardsMastered: Number(row.cards_mastered ?? 0),
    avgRetrievability: Number(row.avg_retrievability ?? 0),
    avgHalfLife: Number(row.avg_half_life ?? 0),
    avgDifficulty: Number(row.avg_difficulty ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    rememberedCount: Number(row.remembered_count ?? 0),
    lastStudied: row.last_studied ? new Date(row.last_studied) : null,
  }));
}

async function recomputeDomainMastery(userId: string): Promise<DomainMasteryRow[]> {
  const aggregates = await getDomainAggregates(userId);

  await db.delete(domainMastery).where(eq(domainMastery.userId, userId));

  if (aggregates.length === 0) return [];

  const now = new Date();
  return db.insert(domainMastery).values(aggregates.map(row => ({
    userId,
    domain: row.domain,
    masteryLevel: calculateMastery(row),
    cardsTotal: row.cardsTotal,
    cardsMastered: row.cardsMastered,
    avgRetrievability: round(row.avgRetrievability),
    lastStudied: row.lastStudied,
    updatedAt: now,
  }))).returning();
}

async function getWeakPointAggregates(userId: string): Promise<WeakPointAggregate[]> {
  const result = await db.execute(sql`
    SELECT
      cn.id AS concept_a_id,
      cn.label AS concept_a_label,
      greatest(sum(c.lapse_count), count(cr.id) FILTER (WHERE cr.rating = 1), 1)::int AS confusion_count,
      coalesce(avg(c.retrievability), 0)::float AS avg_retrievability,
      max(c.lapse_count)::int AS max_lapse_count,
      max(coalesce(cr.reviewed_at, c.last_reviewed_at, c.updated_at, c.created_at)) AS last_confused
    FROM card_concepts cc
    INNER JOIN concepts cn ON cn.id = cc.concept_id
    INNER JOIN cards c ON c.id = cc.card_id
    LEFT JOIN card_reviews cr ON cr.card_id = c.id AND cr.user_id = ${userId}
    WHERE cc.user_id = ${userId}
      AND c.user_id = ${userId}
      AND c.suspended = false
      AND (
        c.lapse_count > 0
        OR c.retrievability < 0.65
        OR cr.rating = 1
      )
    GROUP BY cn.id, cn.label
    ORDER BY confusion_count DESC, avg_retrievability ASC, last_confused DESC
    LIMIT 50
  `);

  return rowsOf<any>(result).map(row => ({
    conceptAId: row.concept_a_id ?? null,
    conceptALabel: String(row.concept_a_label),
    confusionCount: Number(row.confusion_count ?? 1),
    avgRetrievability: Number(row.avg_retrievability ?? 0),
    maxLapseCount: Number(row.max_lapse_count ?? 0),
    lastConfused: row.last_confused ? new Date(row.last_confused) : new Date(),
  }));
}

async function recomputeWeakPoints(userId: string): Promise<WeakPointRow[]> {
  const aggregates = await getWeakPointAggregates(userId);

  await db.delete(weakPoints).where(eq(weakPoints.userId, userId));

  if (aggregates.length === 0) return [];

  const now = new Date();
  return db.insert(weakPoints).values(aggregates.map(row => ({
    userId,
    conceptAId: row.conceptAId,
    conceptBId: null,
    conceptALabel: row.conceptALabel,
    conceptBLabel: null,
    confusionCount: row.confusionCount,
    evidence: {
      type: 'review_performance',
      avgRetrievability: round(row.avgRetrievability),
      maxLapseCount: row.maxLapseCount,
    },
    lastConfused: row.lastConfused,
    updatedAt: now,
  }))).returning();
}

export async function getOrCreateProfile(userId: string): Promise<ProfileRow> {
  const [existing] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(userProfiles).values({ userId }).returning();
  return created;
}

export async function recomputeProfile(userId: string) {
  const [masteryRows, weakRows] = await Promise.all([
    recomputeDomainMastery(userId),
    recomputeWeakPoints(userId),
  ]);

  const stats = await getProfileStats(userId);
  stats.domainCount = masteryRows.length;
  stats.weakPointCount = weakRows.length;

  const calculated = calculateProfile(stats);
  const now = new Date();

  const [profile] = await db.insert(userProfiles).values({
    userId,
    ...calculated,
    stats,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: userProfiles.userId,
    set: {
      ...calculated,
      stats,
      updatedAt: now,
    },
  }).returning();

  return {
    profile,
    domainMastery: masteryRows,
    weakPoints: weakRows,
  };
}

export async function getDomainMastery(userId: string): Promise<DomainMasteryRow[]> {
  return db.select()
    .from(domainMastery)
    .where(eq(domainMastery.userId, userId))
    .orderBy(desc(domainMastery.masteryLevel), desc(domainMastery.updatedAt));
}

export async function getWeakPoints(userId: string, limit = 20): Promise<WeakPointRow[]> {
  return db.select()
    .from(weakPoints)
    .where(eq(weakPoints.userId, userId))
    .orderBy(desc(weakPoints.confusionCount), desc(weakPoints.lastConfused))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getProfileSummary(userId: string): Promise<string> {
  const profile = await getOrCreateProfile(userId);
  const [domains, weak] = await Promise.all([
    getDomainMastery(userId),
    getWeakPoints(userId, 5),
  ]);

  const styleHints = [
    profile.styleConcise > 0.25 ? '偏好简洁回答' : profile.styleConcise < -0.25 ? '可以接受较详细解释' : '回答长度适中',
    profile.styleGradual > 0.25 ? '适合循序渐进拆解' : profile.styleGradual < -0.25 ? '可以更快进入抽象层' : '抽象和例子保持平衡',
    profile.styleIntuitive > 0.25 ? '先给直觉图景再给严谨细节' : '直觉解释和形式化表达并重',
  ];

  const domainText = domains.slice(0, 3)
    .map(item => `${item.domain} ${Math.round(item.masteryLevel)}分`)
    .join('、') || '暂无稳定领域数据';

  const weakText = weak.slice(0, 3)
    .map(item => item.conceptALabel)
    .join('、') || '暂无明显薄弱点';

  return [
    '用户认知画像：',
    `- 表达偏好：${styleHints.join('；')}。`,
    `- 近期领域掌握：${domainText}。`,
    `- 当前薄弱点：${weakText}。`,
    `- 记忆参数：稳定因子 ${profile.memoryStabilityFactor.toFixed(2)}，提取阈值 ${profile.memoryRetrievabilityThreshold.toFixed(2)}，画像置信度 ${Math.round(profile.confidence * 100)}%。`,
  ].join('\n');
}

export function refreshProfileAfterLearningEvent(
  userId: string,
  log?: Pick<FastifyBaseLogger, 'warn'>
) {
  recomputeProfile(userId).catch(err => {
    log?.warn({ err, userId }, 'Failed to refresh cognitive profile after learning event');
  });
}
