import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { notes } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { createJob, getJob } from '../services/extraction/job-service.js';
import { processExtraction } from '../services/extraction/processor.js';

export async function extractionRoutes(app: FastifyInstance) {
  app.post('/jobs', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { sourceType, sourceId } = request.body as { sourceType: string; sourceId: string };

    let content = '';
    if (sourceType === 'note') {
      const [note] = await db.select().from(notes).where(eq(notes.id, sourceId)).limit(1);
      if (!note) return reply.status(404).send({ error: 'Note not found' });
      content = note.content;
    } else if (sourceType === 'conversation') {
      // TODO: get message content
      return reply.status(400).send({ error: 'Conversation extraction not yet implemented' });
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
    const { summary, cards } = request.body as any;

    if (summary) {
      await db.insert(notes).values({
        userId,
        title: summary.title || '提炼摘要',
        content: summary.content || summary,
        sourceType: 'extraction',
        sourceId: id,
      });
    }

    // TODO: save cards

    return { success: true };
  });
}
