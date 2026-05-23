import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  archiveConversationMemory,
  listConversationMemories,
  rejectConversationMemory,
  updateConversationMemory,
} from '../services/long-term-memory-service.js';

const memoryTypeSchema = z.enum(['preference', 'goal', 'fact', 'decision', 'open_question', 'concept', 'correction']);
const memoryStatusSchema = z.enum(['active', 'archived', 'rejected']);

const listQuerySchema = z.object({
  status: memoryStatusSchema.optional().default('active'),
  type: memoryTypeSchema.optional(),
  limit: z.coerce.number().optional().default(100),
  offset: z.coerce.number().optional().default(0),
});

const updateSchema = z.object({
  type: memoryTypeSchema.optional(),
  content: z.string().min(1).optional(),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  status: memoryStatusSchema.optional(),
});

export async function memoryRoutes(app: FastifyInstance) {
  app.get('/', { onRequest: [app.authenticate] }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    return listConversationMemories({
      userId: request.user!.id,
      status: query.status,
      type: query.type,
      limit: query.limit,
      offset: query.offset,
    });
  });

  app.patch('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateSchema.parse(request.body);
    const memory = await updateConversationMemory(request.user!.id, id, body);
    if (!memory) {
      return reply.status(404).send({ error: 'Memory not found' });
    }
    return memory;
  });

  app.delete('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const memory = await archiveConversationMemory(request.user!.id, id);
    if (!memory) {
      return reply.status(404).send({ error: 'Memory not found' });
    }
    return memory;
  });

  app.post('/:id/reject', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const memory = await rejectConversationMemory(request.user!.id, id);
    if (!memory) {
      return reply.status(404).send({ error: 'Memory not found' });
    }
    return memory;
  });
}
