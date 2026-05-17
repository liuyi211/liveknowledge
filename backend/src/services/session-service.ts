import { db } from '../db/index.js';
import { chatSessions, messages, personas } from '../db/schema.js';
import { eq, and, desc, sql, like, or } from 'drizzle-orm';

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

  return { ...session, messages: sessionMessages };
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

export async function deleteSession(id: string, userId: string) {
  // Delete messages first to avoid FK constraint violation
  await db.delete(messages)
    .where(eq(messages.sessionId, id));

  await db.delete(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)));
}

export async function clearSessionMessages(id: string, userId: string) {
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
