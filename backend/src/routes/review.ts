import { FastifyInstance } from 'fastify';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { cardReviews, cards, notes } from '../db/schema.js';
import { formatInterval, predictRatingIntervals, scheduleReview } from '../services/review/scheduler.js';
import type { ReviewRating } from '../services/review/types.js';

const dueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tag: z.string().trim().min(1).optional(),
  noteId: z.string().uuid().optional(),
  mode: z.enum(['due', 'weak']).default('due'),
});

const rateSchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  responseTimeMs: z.coerce.number().int().min(0).max(24 * 60 * 60 * 1000).default(0),
});

const qualityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  includeReviewed: z.coerce.boolean().default(false),
});

const updateCardSchema = z.object({
  front: z.string().trim().min(1).max(2000).optional(),
  back: z.string().trim().min(1).max(4000).optional(),
});

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getDueStatus(card: typeof cards.$inferSelect): 'new' | 'learning' | 'review' | 'lapsed' {
  if (card.reviewCount === 0) return 'new';
  if (card.lapseCount > 0 && card.retrievability < 0.6) return 'lapsed';
  if (card.halfLife < 1) return 'learning';
  return 'review';
}

function enrichCard(card: typeof cards.$inferSelect, noteTitle?: string | null) {
  const predictedIntervals = predictRatingIntervals({
    difficulty: card.difficulty,
    halfLife: card.halfLife,
    lastReviewedAt: card.lastReviewedAt,
    reviewCount: card.reviewCount,
    lapseCount: card.lapseCount,
    reviewedAt: new Date(),
  });

  return {
    ...card,
    noteTitle: noteTitle ?? null,
    noteSummary: null as string | null,
    dueStatus: getDueStatus(card),
    predictedIntervals: {
      again: predictedIntervals[1].label,
      hard: predictedIntervals[2].label,
      good: predictedIntervals[3].label,
      easy: predictedIntervals[4].label,
    },
  };
}

function summarizeNoteContent(content?: string | null): string | null {
  if (!content) return null;
  const normalized = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_\-\[\]()`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? normalized.slice(0, 180) : null;
}

export async function reviewRoutes(app: FastifyInstance) {
  app.get('/due', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const { limit, tag, noteId, mode } = dueQuerySchema.parse(request.query ?? {});
    const now = new Date();

    const conditions = [
      eq(cards.userId, userId),
      eq(cards.suspended, false),
      lte(cards.nextReviewAt, now),
    ];

    if (noteId) conditions.push(eq(cards.noteId, noteId));
    if (tag) conditions.push(sql`${tag} = ANY(${cards.tags})`);

    if (mode === 'due') conditions.push(lte(cards.nextReviewAt, now));
    if (mode === 'weak') conditions.push(sql`${cards.lapseCount} > 0`);

    const rowsQuery = db.select({
      card: cards,
      noteTitle: notes.title,
      noteContent: notes.content,
    })
      .from(cards)
      .leftJoin(notes, eq(cards.noteId, notes.id))
      .where(and(...conditions));

    const rows = mode === 'weak'
      ? await rowsQuery.orderBy(sql`${cards.lapseCount} DESC`, asc(cards.nextReviewAt)).limit(limit)
      : await rowsQuery.orderBy(asc(cards.nextReviewAt), asc(cards.createdAt)).limit(limit);

    const [total] = await db.select({ value: count() })
      .from(cards)
      .where(and(...conditions));

    return {
      cards: rows.map((row) => ({
        ...enrichCard(row.card, row.noteTitle),
        noteSummary: summarizeNoteContent(row.noteContent),
      })),
      totalDue: total?.value ?? rows.length,
      groups: {
        newCount: rows.filter((row) => getDueStatus(row.card) === 'new').length,
        reviewCount: rows.filter((row) => getDueStatus(row.card) === 'review').length,
        lapsedCount: rows.filter((row) => getDueStatus(row.card) === 'lapsed').length,
      },
    };
  });

  app.get('/filters', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const now = new Date();

    const tagRows = await db.execute(sql`
      SELECT tag, count(*)::int AS count
      FROM cards, unnest(coalesce(tags, ARRAY[]::text[])) AS tag
      WHERE user_id = ${userId}
        AND suspended = false
        AND next_review_at <= ${now}
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `);

    const noteRows = await db.select({
      noteId: cards.noteId,
      title: notes.title,
      count: count(),
    })
      .from(cards)
      .leftJoin(notes, eq(cards.noteId, notes.id))
      .where(and(eq(cards.userId, userId), eq(cards.suspended, false), lte(cards.nextReviewAt, now)))
      .groupBy(cards.noteId, notes.title)
      .orderBy(sql`count(*) DESC`, asc(notes.title));

    return {
      tags: (((tagRows as any).rows || tagRows) as Array<{ tag: string; count: number }>).map((row) => ({
        tag: row.tag,
        count: Number(row.count),
      })),
      notes: noteRows
        .filter((row) => row.noteId)
        .map((row) => ({
          noteId: row.noteId,
          title: row.title ?? '未命名笔记',
          count: row.count,
        })),
    };
  });

  app.get('/quality', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const { limit, includeReviewed } = qualityQuerySchema.parse(request.query ?? {});

    const conditions = [
      eq(cards.userId, userId),
      eq(cards.suspended, false),
      sql`${cards.lapseCount} >= 3`,
    ];
    if (!includeReviewed) conditions.push(isNull(cards.qualityReviewedAt));

    const rows = await db.select({
      card: cards,
      noteTitle: notes.title,
      noteContent: notes.content,
    })
      .from(cards)
      .leftJoin(notes, eq(cards.noteId, notes.id))
      .where(and(...conditions))
      .orderBy(desc(cards.lapseCount), asc(cards.updatedAt))
      .limit(limit);

    return {
      cards: rows.map((row) => ({
        ...enrichCard(row.card, row.noteTitle),
        noteSummary: summarizeNoteContent(row.noteContent),
      })),
    };
  });

  app.patch('/cards/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const body = updateCardSchema.parse(request.body ?? {});

    if (!body.front && !body.back) {
      return reply.status(400).send({ error: 'No card fields to update' });
    }

    const [card] = await db.update(cards)
      .set({
        ...body,
        qualityReviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(cards.id, id), eq(cards.userId, userId)))
      .returning();

    if (!card) return reply.status(404).send({ error: 'Card not found' });
    return card;
  });

  app.post('/cards/:id/suspend', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const now = new Date();

    const [card] = await db.update(cards)
      .set({ suspended: true, qualityReviewedAt: now, updatedAt: now })
      .where(and(eq(cards.id, id), eq(cards.userId, userId)))
      .returning();

    if (!card) return reply.status(404).send({ error: 'Card not found' });
    return card;
  });

  app.post('/cards/:id/quality-reviewed', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const now = new Date();

    const [card] = await db.update(cards)
      .set({ qualityReviewedAt: now, updatedAt: now })
      .where(and(eq(cards.id, id), eq(cards.userId, userId)))
      .returning();

    if (!card) return reply.status(404).send({ error: 'Card not found' });
    return card;
  });

  app.post('/cards/:id/rate', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const { rating, responseTimeMs } = rateSchema.parse(request.body ?? {});
    const reviewedAt = new Date();

    const [card] = await db.select()
      .from(cards)
      .where(and(eq(cards.id, id), eq(cards.userId, userId)))
      .limit(1);

    if (!card) {
      return reply.status(404).send({ error: 'Card not found' });
    }

    if (card.suspended) {
      return reply.status(400).send({ error: 'Card is suspended' });
    }

    const scheduled = scheduleReview({
      difficulty: card.difficulty,
      halfLife: card.halfLife,
      lastReviewedAt: card.lastReviewedAt,
      reviewCount: card.reviewCount,
      lapseCount: card.lapseCount,
      rating: rating as ReviewRating,
      reviewedAt,
    });

    await db.transaction(async (tx) => {
      await tx.insert(cardReviews).values({
        cardId: card.id,
        userId,
        rating,
        responseTimeMs,
        halfLifeBefore: card.halfLife,
        halfLifeAfter: scheduled.halfLife,
        difficultyBefore: card.difficulty,
        difficultyAfter: scheduled.difficulty,
        retrievabilityBefore: card.retrievability,
        retrievabilityAfter: scheduled.retrievability,
        reviewedAt,
      });

      await tx.update(cards)
        .set({
          difficulty: scheduled.difficulty,
          halfLife: scheduled.halfLife,
          retrievability: scheduled.retrievability,
          lastReviewedAt: reviewedAt,
          nextReviewAt: scheduled.nextReviewAt,
          reviewCount: card.reviewCount + 1,
          lapseCount: scheduled.lapseCount,
          updatedAt: reviewedAt,
        })
        .where(and(eq(cards.id, card.id), eq(cards.userId, userId)));
    });

    const [updatedCard] = await db.select()
      .from(cards)
      .where(and(eq(cards.id, id), eq(cards.userId, userId)))
      .limit(1);

    return {
      card: updatedCard,
      schedule: scheduled,
      feedback: {
        intervalLabel: formatInterval(scheduled.intervalDays),
        halfLifeBefore: card.halfLife,
        halfLifeAfter: scheduled.halfLife,
        difficultyBefore: card.difficulty,
        difficultyAfter: scheduled.difficulty,
      },
    };
  });

  app.get('/stats', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    const weekEnd = addDays(today, 7);

    const [due] = await db.select({ value: count() })
      .from(cards)
      .where(and(eq(cards.userId, userId), eq(cards.suspended, false), lte(cards.nextReviewAt, now)));

    const [reviewedToday] = await db.select({ value: count() })
      .from(cardReviews)
      .where(and(eq(cardReviews.userId, userId), gte(cardReviews.reviewedAt, today)));

    const [rememberedToday] = await db.select({ value: count() })
      .from(cardReviews)
      .where(and(
        eq(cardReviews.userId, userId),
        gte(cardReviews.reviewedAt, today),
        inArray(cardReviews.rating, [2, 3, 4])
      ));

    const [tomorrowDue] = await db.select({ value: count() })
      .from(cards)
      .where(and(
        eq(cards.userId, userId),
        eq(cards.suspended, false),
        gte(cards.nextReviewAt, tomorrow),
        lte(cards.nextReviewAt, addDays(tomorrow, 1))
      ));

    const [weekDue] = await db.select({ value: count() })
      .from(cards)
      .where(and(
        eq(cards.userId, userId),
        eq(cards.suspended, false),
        gte(cards.nextReviewAt, now),
        lte(cards.nextReviewAt, weekEnd)
      ));

    const dailyLoad = await Promise.all(Array.from({ length: 7 }, async (_, index) => {
      const dayStart = addDays(today, index);
      const dayEnd = addDays(dayStart, 1);
      const [row] = await db.select({ value: count() })
        .from(cards)
        .where(and(
          eq(cards.userId, userId),
          eq(cards.suspended, false),
          gte(cards.nextReviewAt, dayStart),
          lte(cards.nextReviewAt, dayEnd)
        ));
      return {
        date: dayStart.toISOString().slice(0, 10),
        count: row?.value ?? 0,
      };
    }));

    const [weakCount] = await db.select({ value: count() })
      .from(cards)
      .where(and(eq(cards.userId, userId), eq(cards.suspended, false), sql`${cards.lapseCount} > 0`));

    const [rewriteSuggestedCount] = await db.select({ value: count() })
      .from(cards)
      .where(and(eq(cards.userId, userId), eq(cards.suspended, false), sql`${cards.lapseCount} >= 3`));

    const dueCards = await db.select()
      .from(cards)
      .where(and(eq(cards.userId, userId), eq(cards.suspended, false), lte(cards.nextReviewAt, now)));

    const reviewedCount = reviewedToday?.value ?? 0;

    return {
      dueCount: due?.value ?? 0,
      reviewedToday: reviewedCount,
      accuracyToday: reviewedCount > 0 ? (rememberedToday?.value ?? 0) / reviewedCount : null,
      groups: {
        newCount: dueCards.filter((card) => getDueStatus(card) === 'new').length,
        reviewCount: dueCards.filter((card) => getDueStatus(card) === 'review').length,
        lapsedCount: dueCards.filter((card) => getDueStatus(card) === 'lapsed').length,
      },
      weakCount: weakCount?.value ?? 0,
      rewriteSuggestedCount: rewriteSuggestedCount?.value ?? 0,
      upcoming: {
        today: due?.value ?? 0,
        tomorrow: tomorrowDue?.value ?? 0,
        week: weekDue?.value ?? 0,
      },
      dailyLoad,
    };
  });
}
