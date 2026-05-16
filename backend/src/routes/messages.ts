import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { messages, chatSessions, personas } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { streamChat, chat } from '../services/ai-provider.js';

const sendSchema = z.object({
  content: z.string().min(1),
});

export async function messageRoutes(app: FastifyInstance) {
  app.get('/session/:sessionId', { onRequest: [app.authenticate] }, async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    return db.select().from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.createdAt);
  });

  app.post('/session/:sessionId', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = sendSchema.parse(request.body);
    const userId = request.user!.id;

    await db.insert(messages).values({
      sessionId,
      role: 'user',
      content: body.content,
    });

    const [session] = await db.select().from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
      .limit(1);

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    let systemPrompt = 'You are a helpful assistant.';
    if (session.personaId) {
      const [persona] = await db.select().from(personas)
        .where(eq(personas.id, session.personaId)).limit(1);
      if (persona) {
        systemPrompt = persona.systemPromptTemplate;
      }
    }

    const recentMessages = await db.select().from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.createdAt)
      .limit(20);

    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...recentMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const model = session.modelId || 'gpt-4o-mini';
    const response = await chat(userId, { model, messages: chatMessages }, request.log);

    const [assistantMessage] = await db.insert(messages).values({
      sessionId,
      role: 'assistant',
      content: response,
      modelId: model,
    }).returning();

    await db.update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, sessionId));

    return assistantMessage;
  });

  app.post('/session/:sessionId/stream', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = sendSchema.parse(request.body);
    const userId = request.user!.id;

    await db.insert(messages).values({
      sessionId,
      role: 'user',
      content: body.content,
    });

    const [session] = await db.select().from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
      .limit(1);

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    let systemPrompt = 'You are a helpful assistant.';
    if (session.personaId) {
      const [persona] = await db.select().from(personas)
        .where(eq(personas.id, session.personaId)).limit(1);
      if (persona) {
        systemPrompt = persona.systemPromptTemplate;
      }
    }

    const recentMessages = await db.select().from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.createdAt)
      .limit(20);

    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...recentMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const model = session.modelId || 'gpt-4o-mini';

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let fullResponse = '';

    try {
      for await (const chunk of streamChat(userId, { model, messages: chatMessages }, request.log)) {
        fullResponse += chunk;
        reply.raw.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      }

      await db.insert(messages).values({
        sessionId,
        role: 'assistant',
        content: fullResponse,
        modelId: model,
      });

      await db.update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(chatSessions.id, sessionId));

      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: (err as Error).message })}\n\n`);
    } finally {
      reply.raw.end();
    }
  });
}
