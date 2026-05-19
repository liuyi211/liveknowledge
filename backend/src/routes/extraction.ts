import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cards as cardsTable, chatSessions, extractionJobs, importSources, messages, notes } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { createJob, getJob } from '../services/extraction/job-service.js';
import { processExtraction } from '../services/extraction/processor.js';
import { z } from 'zod';
import { createHash } from 'crypto';

const cardSchema = z.object({
  front: z.string().trim().min(1).max(2000),
  back: z.string().trim().min(1).max(4000),
});

const entitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(50),
  description: z.string().trim().max(1000).optional().default(''),
});

const relationSchema = z.object({
  source: z.string().trim().min(1).max(200),
  target: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).optional().default(''),
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
  entities: z.array(entitySchema).optional().default([]),
  relations: z.array(relationSchema).optional().default([]),
});

const createJobSchema = z.object({
  sourceType: z.enum(['note', 'conversation', 'document', 'import']),
  sourceId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(300000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function buildInputSnapshot(content: string) {
  return {
    contentLength: content.length,
    contentHash: hashContent(content),
    preview: content.slice(0, 500),
  };
}

async function createOrReuseImportSource(
  userId: string,
  sourceType: 'document' | 'import',
  title: string,
  content: string,
  metadata?: Record<string, unknown>
) {
  const contentHash = hashContent(content);
  const [existing] = await db.select().from(importSources)
    .where(and(
      eq(importSources.userId, userId),
      eq(importSources.sourceType, sourceType),
      eq(importSources.contentHash, contentHash)
    ))
    .limit(1);

  if (existing) {
    return { source: existing, duplicate: true };
  }

  const [source] = await db.insert(importSources).values({
    userId,
    sourceType,
    title,
    content,
    contentHash,
    metadata: metadata ?? null,
  }).returning();

  return { source, duplicate: false };
}

export async function extractionRoutes(app: FastifyInstance) {
  app.post('/jobs', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const body = createJobSchema.parse(request.body ?? {});

    let content = '';
    let sourceId = body.sourceId;
    let duplicateSource = false;

    if (body.sourceType === 'note') {
      if (!sourceId) return reply.status(400).send({ error: 'sourceId is required for note extraction' });
      const [note] = await db.select().from(notes)
        .where(and(eq(notes.id, sourceId), eq(notes.userId, userId)))
        .limit(1);
      if (!note) return reply.status(404).send({ error: 'Note not found' });
      content = note.content;
    } else if (body.sourceType === 'conversation') {
      if (!sourceId) return reply.status(400).send({ error: 'sourceId is required for conversation extraction' });
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
    } else if (body.sourceType === 'document' || body.sourceType === 'import') {
      if (!body.content) {
        return reply.status(400).send({ error: 'content is required for document/import extraction' });
      }
      const { source, duplicate } = await createOrReuseImportSource(
        userId,
        body.sourceType,
        body.title || (body.sourceType === 'document' ? '未命名文档' : '粘贴导入'),
        body.content,
        body.metadata
      );
      sourceId = source.id;
      content = source.content;
      duplicateSource = duplicate;
    } else {
      return reply.status(400).send({ error: 'Unsupported extraction source type' });
    }

    const snapshot = buildInputSnapshot(content);
    const previousJobs = sourceId
      ? await db.select({ id: extractionJobs.id, createdAt: extractionJobs.createdAt })
        .from(extractionJobs)
        .where(and(
          eq(extractionJobs.userId, userId),
          eq(extractionJobs.sourceType, body.sourceType),
          eq(extractionJobs.sourceId, sourceId)
        ))
      : [];

    const jobId = await createJob(userId, body.sourceType, sourceId!, {
      inputSnapshot: snapshot,
      duplicateSource,
      previousJobIds: previousJobs.map(job => job.id),
      version: previousJobs.length + 1,
    });
    processExtraction(jobId, body.sourceType, sourceId!, content, userId, undefined, {
      inputSnapshot: snapshot,
      duplicateSource,
      previousJobIds: previousJobs.map(job => job.id),
      version: previousJobs.length + 1,
    })
      .catch(err => request.log.error({ err, jobId }, '知识提炼任务失败'));

    return {
      jobId,
      sourceId,
      duplicateSource,
      previousJobIds: previousJobs.map(job => job.id),
    };
  });

  app.get('/jobs/:id', { onRequest: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return getJob(id);
  });

  app.post('/jobs/:id/adopt', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const { summary, cards, entities, relations } = adoptSchema.parse(request.body ?? {});

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
          extractionVersion: (job.userFeedback as any)?.config?.version ?? 1,
          inputSnapshot: (job.userFeedback as any)?.config?.inputSnapshot,
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
        type: 'basic' as const,
        tags: ['extraction'],
        difficulty: 6,
        halfLife: 1,
        retrievability: 1,
        nextReviewAt: new Date(),
        reviewCount: 0,
        lapseCount: 0,
        suspended: false,
      }))).returning({ id: cardsTable.id })
      : [];

    const feedback = {
      accepted: Boolean(summary) || createdCards.length > 0,
      accepted_notes: noteId && summary ? [noteId] : [],
      accepted_cards: createdCards.map(card => card.id),
      accepted_entities: entities,
      accepted_relations: relations,
      modifications: {
        selectedCounts: {
          notes: summary ? 1 : 0,
          cards: cards.length,
          entities: entities.length,
          relations: relations.length,
        },
      },
      accepted_at: new Date().toISOString(),
      config: (job.userFeedback as any)?.config,
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
