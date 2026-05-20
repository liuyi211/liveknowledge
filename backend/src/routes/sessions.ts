import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as sessionService from '../services/session-service.js';

const createSchema = z.object({
  personaId: z.string().optional(),
  modelId: z.string().optional(),
  title: z.string().optional(),
});

const updateSchema = z.object({
  personaId: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
  title: z.string().optional(),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  sort: z.enum(['updated', 'created']).optional().default('updated'),
  limit: z.coerce.number().optional().default(100),
  offset: z.coerce.number().optional().default(0),
});

export async function sessionRoutes(app: FastifyInstance) {
  app.get('/', { onRequest: [app.authenticate] }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    return sessionService.listSessions({
      userId: request.user!.id,
      q: query.q,
      sort: query.sort,
      limit: query.limit,
      offset: query.offset,
    });
  });

  app.post('/', { onRequest: [app.authenticate] }, async (request) => {
    const body = createSchema.parse(request.body);
    return sessionService.createSession({
      userId: request.user!.id,
      title: body.title,
      personaId: body.personaId,
      modelId: body.modelId,
    });
  });

  app.get('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    const result = await sessionService.getSessionWithMessages(id, userId);
    if (!result) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    return result;
  });

  app.patch('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateSchema.parse(request.body);
    const userId = request.user!.id;

    const session = await sessionService.updateSessionWithPersonaSummary(id, userId, body, request.log);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    return session;
  });

  app.delete('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await sessionService.deleteSession(id, request.user!.id);
    return reply.send({ message: 'Deleted' });
  });

  app.post('/:id/clear', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await sessionService.clearSessionMessages(id, request.user!.id);
    return reply.send({ message: 'Cleared' });
  });
}
