import { db } from '../db/index.js';
import { chatSessions, messages, personas, attachments } from '../db/schema.js';
import { eq, and, desc, sql, like, or, inArray } from 'drizzle-orm';
import { chat, getDefaultChatModel } from './ai-provider.js';
import type { FastifyBaseLogger } from 'fastify';

export interface CreateSessionInput {
  userId: string;
  title?: string;
  personaId?: string;
  modelId?: string;
}

export interface UpdateSessionInput {
  title?: string;
  personaId?: string | null;
  modelId?: string | null;
}

export interface SessionListOptions {
  userId: string;
  q?: string;
  sort?: 'updated' | 'created';
  limit?: number;
  offset?: number;
}

export async function createSession(input: CreateSessionInput) {
  const [session] = await db.insert(chatSessions).values({
    userId: input.userId,
    title: input.title || 'New Chat',
    personaId: input.personaId || null,
    modelId: input.modelId || null,
  }).returning();
  return session;
}

export async function getSessionById(id: string, userId: string) {
  const [session] = await db.select().from(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)))
    .limit(1);
  return session || null;
}

export async function getSessionWithMessages(id: string, userId: string) {
  const [session] = await db.select().from(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)))
    .limit(1);

  if (!session) return null;

  const sessionMessages = await db.select().from(messages)
    .where(and(
      eq(messages.sessionId, id),
      eq(messages.isDeleted, false)
    ))
    .orderBy(messages.createdAt);

  // Fetch attachments for each message
  const messagesWithAttachments = [];
  for (const msg of sessionMessages) {
    const atts = await db.select().from(attachments)
      .where(eq(attachments.messageId, msg.id));
    messagesWithAttachments.push({ ...msg, attachments: atts });
  }

  return { ...session, messages: messagesWithAttachments };
}

export async function listSessions(options: SessionListOptions) {
  const { userId, q, sort = 'updated', limit = 100, offset = 0 } = options;

  let query = db.select().from(chatSessions)
    .where(eq(chatSessions.userId, userId));

  if (q) {
    query = db.select().from(chatSessions)
      .where(and(
        eq(chatSessions.userId, userId),
        or(
          like(chatSessions.title, `%${q}%`),
          like(chatSessions.lastMessagePreview || '', `%${q}%`)
        )
      ));
  }

  const orderBy = sort === 'created'
    ? desc(chatSessions.createdAt)
    : desc(chatSessions.updatedAt);

  return query.orderBy(orderBy).limit(limit).offset(offset);
}

export async function updateSession(id: string, userId: string, input: UpdateSessionInput) {
  const [session] = await db.update(chatSessions)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)))
    .returning();
  return session || null;
}

function buildFallbackSummary(sessionMessages: Array<{ role: string; content: string }>): string {
  if (sessionMessages.length === 0) return '';
  return sessionMessages
    .slice(-8)
    .map(message => `${message.role === 'user' ? '用户' : '助手'}：${message.content.slice(0, 240)}`)
    .join('\n');
}

export async function summarizeSessionForPersonaSwitch(id: string, userId: string, log?: FastifyBaseLogger): Promise<string> {
  const sessionMessages = await db.select({
    role: messages.role,
    content: messages.content,
  }).from(messages)
    .where(and(
      eq(messages.sessionId, id),
      eq(messages.isDeleted, false)
    ))
    .orderBy(desc(messages.createdAt))
    .limit(20);

  const orderedMessages = sessionMessages.reverse();
  if (orderedMessages.length === 0) return '';

  const transcript = orderedMessages
    .map(message => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
    .join('\n\n')
    .slice(0, 12000);

  try {
    const defaultConfig = await getDefaultChatModel(userId);
    const response = await chat(userId, {
      model: defaultConfig.model,
      providerType: defaultConfig.providerType,
      messages: [{
        role: 'user',
        content: `请为一次导师人格切换生成简洁上下文摘要，让新的导师能延续对话。\n\n要求：\n1. 保留用户当前目标、已讨论结论、未解决问题。\n2. 不超过 300 字。\n3. 不要添加原对话没有的信息。\n\n对话：\n${transcript}`,
      }],
      temperature: 0.2,
      maxTokens: 500,
    }, log || consoleLogger);
    return response.content.trim().slice(0, 1200) || buildFallbackSummary(orderedMessages);
  } catch (err) {
    log?.warn({ err }, 'Failed to summarize session for persona switch');
    return buildFallbackSummary(orderedMessages);
  }
}

export async function updateSessionWithPersonaSummary(
  id: string,
  userId: string,
  input: UpdateSessionInput,
  log?: FastifyBaseLogger
) {
  const existing = await getSessionById(id, userId);
  if (!existing) return null;

  let contextSummary = existing.contextSummary;
  if ('personaId' in input && input.personaId !== existing.personaId) {
    contextSummary = await summarizeSessionForPersonaSwitch(id, userId, log);
  }

  const [session] = await db.update(chatSessions)
    .set({
      ...input,
      contextSummary,
      updatedAt: new Date(),
    })
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)))
    .returning();
  return session || null;
}

export async function deleteSession(id: string, userId: string) {
  const sessionMessages = await db.select({ id: messages.id }).from(messages)
    .where(eq(messages.sessionId, id));
  const messageIds = sessionMessages.map((message) => message.id);

  if (messageIds.length > 0) {
    await db.delete(attachments)
      .where(inArray(attachments.messageId, messageIds));
  }

  await db.delete(messages)
    .where(eq(messages.sessionId, id));

  await db.delete(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)));
}

export async function clearSessionMessages(id: string, userId: string) {
  const sessionMessages = await db.select({ id: messages.id }).from(messages)
    .where(eq(messages.sessionId, id));
  const messageIds = sessionMessages.map((message) => message.id);

  if (messageIds.length > 0) {
    await db.delete(attachments)
      .where(inArray(attachments.messageId, messageIds));
  }

  await db.delete(messages)
    .where(eq(messages.sessionId, id));

  await db.update(chatSessions)
    .set({
      messageCount: 0,
      lastMessagePreview: null,
      updatedAt: new Date(),
    })
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)));
}

export async function updateSessionStats(sessionId: string) {
  const [result] = await db.select({
    count: sql<number>`count(*)`,
    lastContent: sql<string>`(SELECT content FROM ${messages} WHERE session_id = ${sessionId} AND is_deleted = false ORDER BY created_at DESC LIMIT 1)`,
  }).from(messages)
    .where(and(eq(messages.sessionId, sessionId), eq(messages.isDeleted, false)));

  await db.update(chatSessions)
    .set({
      messageCount: result?.count || 0,
      lastMessagePreview: result?.lastContent?.slice(0, 200) || null,
      updatedAt: new Date(),
    })
    .where(eq(chatSessions.id, sessionId));
}

export async function getPersonaForSession(personaId: string | null, userId: string) {
  if (!personaId) return null;
  const [persona] = await db.select().from(personas)
    .where(and(eq(personas.id, personaId), eq(personas.userId, userId)))
    .limit(1);
  return persona || null;
}

const consoleLogger: FastifyBaseLogger = {
  info: () => {},
  error: console.error,
  warn: console.warn,
  debug: () => {},
  trace: () => {},
  fatal: console.error,
  child: () => consoleLogger,
  silent: () => {},
} as any;
