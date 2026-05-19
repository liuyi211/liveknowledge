import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cards as cardsTable, chatSessions, extractionJobs, messages, notes } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { createJob, getJob } from '../services/extraction/job-service.js';
import { processExtraction } from '../services/extraction/processor.js';
import { z } from 'zod';

const cardSchema = z.object({
  front: z.string().trim().min(1).max(2000),
  back: z.string().trim().min(1).max(4000),
});

const adoptSchema = z.object({
  summary: z.union([
    z.string().trim().min(1),
    z.object({
      title: z.string().trim().min(1).max(200).optional(),
      content: z.string().trim().min(1).optional(),
    }),
  ]).nullable().optional(),
  cards: z.array(cardSchema).optional().default([]),
});

export async function extractionRoutes(app: FastifyInstance) {
  app.post('/jobs', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { sourceType, sourceId } = request.body as { sourceType: string; sourceId: string };

    let content = '';
    if (sourceType === 'note') {
      const [note] = await db.select().from(notes)
        .where(and(eq(notes.id, sourceId), eq(notes.userId, userId)))
        .limit(1);
      if (!note) return reply.status(404).send({ error: 'Note not found' });
      content = note.content;
    } else if (sourceType === 'conversation') {
      const [session] = await db.select().from(chatSessions)
        .where(and(eq(chatSessions.id, sourceId), eq(chatSessions.userId, userId)))
        .limit(1);
      if (!session) return reply.status(404).send({ error: 'Session not found' });

      const sessionMessages = await db.select({
        role: messages.role,
        content: messages.content,
      }).from(messages)
        .where(and(eq(messages.sessionId, sourceId), eq(messages.isDeleted, false)))
        .orderBy(messages.createdAt);

      if (sessionMessages.length === 0) {
        return reply.status(400).send({ error: 'Session has no messages to extract' });
      }

      content = [
        `会话标题：${session.title || '未命名会话'}`,
        '',
        ...sessionMessages.map(message => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`),
      ].join('\n');
    } else {
      return reply.status(400).send({ error: 'Unsupported extraction source type' });
    }

    const jobId = await createJob(userId, sourceType, sourceId);
    processExtraction(jobId, sourceType, sourceId, content, userId).catch(console.error);

    return { jobId };
  });

  app.get('/jobs/:id', { onRequest: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return getJob(id);
  });

  app.post('/jobs/:id/adopt', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const { summary, cards } = adoptSchema.parse(request.body ?? {});

    const [job] = await db.select().from(extractionJobs)
      .where(and(eq(extractionJobs.id, id), eq(extractionJobs.userId, userId)))
      .limit(1);

    if (!job) {
      return reply.status(404).send({ error: 'Extraction job not found' });
    }

    if (job.status !== 'completed') {
      return reply.status(400).send({ error: 'Extraction job is not completed' });
    }

    let noteId: string | null = null;

    if (summary) {
      const summaryTitle = typeof summary === 'string'
        ? '提炼摘要'
        : summary.title || '提炼摘要';
      const summaryContent = typeof summary === 'string'
        ? summary
        : summary.content || '';

      const [note] = await db.insert(notes).values({
        userId,
        title: summaryTitle,
        content: summaryContent,
        sourceType: 'extraction',
        sourceId: id,
        sourceMetadata: {
          extractionJobId: id,
          originalSourceType: job.sourceType,
          originalSourceId: job.sourceId,
          adoptedAt: new Date().toISOString(),
        },
      }).returning({ id: notes.id });

      noteId = note.id;
    } else if (job.sourceType === 'note') {
      noteId = job.sourceId;
    }

    const createdCards = cards.length > 0
      ? await db.insert(cardsTable).values(cards.map((card) => ({
        userId,
        noteId,
        front: card.front,
        back: card.back,
        tags: ['extraction'],
      }))).returning({ id: cardsTable.id })
      : [];

    const feedback = {
      accepted: Boolean(summary) || createdCards.length > 0,
      accepted_notes: noteId && summary ? [noteId] : [],
      accepted_cards: createdCards.map(card => card.id),
      modifications: {},
      accepted_at: new Date().toISOString(),
    };

    await db.update(extractionJobs)
      .set({ userFeedback: feedback })
      .where(and(eq(extractionJobs.id, id), eq(extractionJobs.userId, userId)));

    return {
      success: true,
      noteId,
      cardIds: createdCards.map(card => card.id),
    };
  });
}
