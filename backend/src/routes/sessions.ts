import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { chatSessions, messages } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';

const createSchema = z.object({
  personaId: z.string().optional(),
  modelId: z.string().optional(),
  title: z.string().optional(),
});

export async function sessionRoutes(app: FastifyInstance) {
  app.get('/', { onRequest: [app.authenticate] }, async (request) => {
    return db.select().from(chatSessions)
      .where(eq(chatSessions.userId, request.user!.id))
      .orderBy(desc(chatSessions.updatedAt));
  });

  app.post('/', { onRequest: [app.authenticate] }, async (request) => {
    const body = createSchema.parse(request.body);
    const [session] = await db.insert(chatSessions).values({
      userId: request.user!.id,
      personaId: body.personaId || null,
      modelId: body.modelId || null,
      title: body.title || 'New Chat',
    }).returning();
    return session;
  });

  app.get('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    const [session] = await db.select().from(chatSessions)
      .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)))
      .limit(1);

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const sessionMessages = await db.select().from(messages)
      .where(eq(messages.sessionId, id))
      .orderBy(messages.createdAt);

    return { ...session, messages: sessionMessages };
  });

  app.patch('/:id', { onRequest: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = createSchema.partial().parse(request.body);

    const [session] = await db.update(chatSessions)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, request.user!.id)))
      .returning();

    return session;
  });

  app.delete('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(chatSessions)
      .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, request.user!.id)));
    return reply.send({ message: 'Deleted' });
  });
}
