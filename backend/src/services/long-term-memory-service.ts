import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { db } from '../db/index.js';
import { conversationMemories, embeddings, messages } from '../db/schema.js';
import { chat, generateEmbedding, getDefaultChatModel } from './ai-provider.js';
import { estimateTokens } from './context-budget-service.js';

const MEMORY_SOURCE_TYPE = 'conversation_memory';
const MIN_IMPORTANCE = 0.5;
const MIN_CONFIDENCE = 0.65;
const MAX_EXTRACTION_TRANSCRIPT_CHARS = 6000;

type ConversationMemory = typeof conversationMemories.$inferSelect;
type MemoryType = ConversationMemory['type'];
type MemoryStatus = ConversationMemory['status'];

const MEMORY_TYPES = new Set<MemoryType>([
  'preference',
  'goal',
  'fact',
  'decision',
  'open_question',
  'concept',
  'correction',
]);

interface ExtractedMemory {
  type: MemoryType;
  content: string;
  importance: number;
  confidence: number;
  reason?: string;
}

export async function extractLongTermMemoriesAfterTurn(
  userId: string,
  sessionId: string,
  sourceMessageIds: string[],
  log?: Pick<FastifyBaseLogger, 'warn' | 'debug'>
): Promise<void> {
  if (sourceMessageIds.length === 0) return;

  const sourceMessages = await db.select({
    id: messages.id,
    role: messages.role,
    content: messages.content,
  }).from(messages)
    .where(inArray(messages.id, sourceMessageIds))
    .orderBy(messages.createdAt);

  if (sourceMessages.length === 0) return;

  const extracted = await extractMemoriesWithModel(userId, sourceMessages, log);
  const usable = extracted.filter(memory =>
    memory.content &&
    memory.importance >= MIN_IMPORTANCE &&
    (memory.confidence >= MIN_CONFIDENCE || memory.type === 'open_question')
  );

  for (const memory of usable) {
    const saved = await upsertMemory(userId, sessionId, memory, sourceMessageIds);
    void storeMemoryEmbedding(saved).catch(err => {
      log?.warn?.({ err, memoryId: saved.id }, 'Failed to store conversation memory embedding');
    });
  }

  log?.debug?.({
    sessionId,
    extracted: extracted.length,
    stored: usable.length,
  }, 'Extracted long-term memories after chat turn');
}

export async function retrieveRelevantMemories(
  userId: string,
  query: string,
  sessionSummary?: string | null,
  limit = 6
): Promise<ConversationMemory[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), 20);
  const searchText = [query, sessionSummary].filter(Boolean).join('\n');

  try {
    const queryVector = await generateEmbedding(searchText || query, userId);
    const results = await db.execute(sql`
      SELECT cm.*
      FROM embeddings e
      INNER JOIN conversation_memories cm ON cm.id = e.source_id
      WHERE e.user_id = ${userId}
        AND e.source_type = ${MEMORY_SOURCE_TYPE}
        AND cm.user_id = ${userId}
        AND cm.status = 'active'
      ORDER BY
        (e.embedding <=> ${sql.raw(`'[${queryVector.join(',')}]'::vector`)}) ASC,
        cm.importance DESC,
        cm.updated_at DESC
      LIMIT ${boundedLimit}
    `);

    const memories = rowsOf<ConversationMemory>(results);
    await markMemoriesUsed(memories);
    return memories;
  } catch {
    const memories = await db.select().from(conversationMemories)
      .where(and(eq(conversationMemories.userId, userId), eq(conversationMemories.status, 'active')))
      .orderBy(desc(conversationMemories.importance), desc(conversationMemories.updatedAt))
      .limit(boundedLimit);
    await markMemoriesUsed(memories);
    return memories;
  }
}

export function formatMemoriesForPrompt(memories: ConversationMemory[], budgetTokens: number): string {
  if (memories.length === 0 || budgetTokens <= 0) return '';

  let usedTokens = 0;
  const lines: string[] = [];
  for (const memory of memories) {
    const line = `${lines.length + 1}. [${memory.type}, importance=${memory.importance.toFixed(2)}, confidence=${memory.confidence.toFixed(2)}] ${memory.content}`;
    const lineTokens = estimateTokens(line);
    if (lines.length > 0 && usedTokens + lineTokens > budgetTokens) break;
    lines.push(line);
    usedTokens += lineTokens;
  }

  return lines.length > 0 ? lines.join('\n') : '';
}

export async function listConversationMemories(input: {
  userId: string;
  status?: MemoryStatus;
  type?: MemoryType;
  limit?: number;
  offset?: number;
}): Promise<ConversationMemory[]> {
  const conditions = [eq(conversationMemories.userId, input.userId)];
  if (input.status) conditions.push(eq(conversationMemories.status, input.status));
  if (input.type) conditions.push(eq(conversationMemories.type, input.type));

  return db.select().from(conversationMemories)
    .where(and(...conditions))
    .orderBy(desc(conversationMemories.updatedAt))
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 200))
    .offset(Math.max(input.offset ?? 0, 0));
}

export async function updateConversationMemory(
  userId: string,
  id: string,
  input: Partial<Pick<ConversationMemory, 'type' | 'content' | 'importance' | 'confidence' | 'status'>>
): Promise<ConversationMemory | null> {
  const patch: Partial<typeof conversationMemories.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.type) patch.type = input.type;
  if (typeof input.content === 'string') {
    patch.content = input.content;
    patch.normalizedContent = normalizeMemoryContent(input.content);
  }
  if (typeof input.importance === 'number') patch.importance = clamp(input.importance, 0, 1);
  if (typeof input.confidence === 'number') patch.confidence = clamp(input.confidence, 0, 1);
  if (input.status) patch.status = input.status;

  const [updated] = await db.update(conversationMemories)
    .set(patch)
    .where(and(eq(conversationMemories.id, id), eq(conversationMemories.userId, userId)))
    .returning();

  if (!updated) return null;
  if (typeof input.content === 'string' || input.type) {
    await storeMemoryEmbedding(updated);
  }
  return updated;
}

export async function archiveConversationMemory(userId: string, id: string): Promise<ConversationMemory | null> {
  return updateConversationMemory(userId, id, { status: 'archived' });
}

export async function rejectConversationMemory(userId: string, id: string): Promise<ConversationMemory | null> {
  return updateConversationMemory(userId, id, { status: 'rejected', confidence: 0 });
}

async function extractMemoriesWithModel(
  userId: string,
  sourceMessages: Array<{ role: string; content: string }>,
  log?: Pick<FastifyBaseLogger, 'warn'>
): Promise<ExtractedMemory[]> {
  const transcript = sourceMessages
    .map(message => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
    .join('\n\n')
    .slice(0, MAX_EXTRACTION_TRANSCRIPT_CHARS);

  try {
    const defaultConfig = await getDefaultChatModel(userId);
    const response = await chat(userId, {
      model: defaultConfig.model,
      providerType: defaultConfig.providerType,
      messages: [{
        role: 'user',
        content: [
          '请从下面这轮对话中提取对未来对话有持续价值的长期记忆。',
          '',
          '只提取明确表达的信息，不要推测用户隐私、身份、性格或未说出口的偏好。',
          '普通知识问答不要保存为记忆，除非它代表用户目标、偏好、项目决策、待跟进问题或重要纠正。',
          '',
          '类型只能是：preference, goal, fact, decision, open_question, concept, correction。',
          'importance 和 confidence 是 0 到 1 的数字。',
          '',
          '输出严格 JSON，不要 Markdown：',
          '{"memories":[{"type":"goal","content":"...","importance":0.8,"confidence":0.9,"reason":"..."}]}',
          '',
          `对话：\n${transcript}`,
        ].join('\n'),
      }],
      temperature: 0,
      maxTokens: 900,
    }, createMemoryLogger(log));

    const parsed = parseJson(response.content);
    if (!Array.isArray(parsed.memories)) return [];

    return (parsed.memories as unknown[])
      .map(normalizeExtractedMemory)
      .filter((memory: ExtractedMemory | null): memory is ExtractedMemory => Boolean(memory));
  } catch (err) {
    log?.warn?.({ err }, 'Failed to extract long-term memories');
    return [];
  }
}

function normalizeExtractedMemory(value: unknown): ExtractedMemory | null {
  const raw = value as Partial<ExtractedMemory>;
  if (!raw || typeof raw.content !== 'string' || !raw.content.trim()) return null;
  if (!raw.type || !MEMORY_TYPES.has(raw.type)) return null;

  return {
    type: raw.type,
    content: raw.content.trim().slice(0, 1200),
    importance: clamp(Number(raw.importance ?? 0.5), 0, 1),
    confidence: clamp(Number(raw.confidence ?? 0.7), 0, 1),
    reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 500) : undefined,
  };
}

async function upsertMemory(
  userId: string,
  sessionId: string,
  memory: ExtractedMemory,
  sourceMessageIds: string[]
): Promise<ConversationMemory> {
  const normalizedContent = normalizeMemoryContent(memory.content);
  const [existing] = await db.select().from(conversationMemories)
    .where(and(
      eq(conversationMemories.userId, userId),
      eq(conversationMemories.type, memory.type),
      eq(conversationMemories.normalizedContent, normalizedContent),
      eq(conversationMemories.status, 'active')
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db.update(conversationMemories)
      .set({
        content: memory.content,
        importance: Math.max(existing.importance, memory.importance),
        confidence: Math.max(existing.confidence, memory.confidence),
        sourceMessageIds: mergeIds(existing.sourceMessageIds || [], sourceMessageIds),
        metadata: {
          ...(existing.metadata as object || {}),
          lastReason: memory.reason,
        },
        updatedAt: new Date(),
      })
      .where(eq(conversationMemories.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(conversationMemories).values({
    userId,
    sessionId,
    type: memory.type,
    content: memory.content,
    normalizedContent,
    sourceMessageIds,
    importance: memory.importance,
    confidence: memory.confidence,
    status: 'active',
    metadata: memory.reason ? { reason: memory.reason } : {},
  }).returning();
  return created;
}

async function storeMemoryEmbedding(memory: ConversationMemory): Promise<void> {
  const vector = await generateEmbedding(memory.content, memory.userId);
  await db.delete(embeddings)
    .where(and(eq(embeddings.sourceType, MEMORY_SOURCE_TYPE), eq(embeddings.sourceId, memory.id)));
  await db.insert(embeddings).values({
    userId: memory.userId,
    sourceType: MEMORY_SOURCE_TYPE,
    sourceId: memory.id,
    chunkIndex: 0,
    content: memory.content,
    metadata: {
      type: memory.type,
      importance: memory.importance,
      confidence: memory.confidence,
      sessionId: memory.sessionId,
    },
    embedding: vector,
  });
}

async function markMemoriesUsed(memories: ConversationMemory[]): Promise<void> {
  if (memories.length === 0) return;
  await db.update(conversationMemories)
    .set({ lastUsedAt: new Date() })
    .where(inArray(conversationMemories.id, memories.map(memory => memory.id)));
}

function normalizeMemoryContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  return JSON.parse(match[0]);
}

function rowsOf<T>(result: unknown): T[] {
  return ((result as any).rows || result || []) as T[];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function mergeIds(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right]));
}

function createMemoryLogger(log?: Pick<FastifyBaseLogger, 'warn'>): FastifyBaseLogger {
  return {
    info: () => {},
    error: () => {},
    warn: (obj: unknown, msg?: string) => log?.warn?.(obj, msg || 'Memory extraction warning'),
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    child: () => createMemoryLogger(log),
    silent: () => {},
  } as any;
}
