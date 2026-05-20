import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getConceptDetail,
  getConceptNeighborhood,
  getCardGraphContext,
  getGraphOverview,
  getGraphQualityReport,
  getGraphHealth,
  findConceptPath,
  recommendLearningPath,
  confirmGraphRelation,
  deleteGraphRelation,
  searchGraph,
} from '../services/graph-store.js';
import { syncUserGraphToNeo4j } from '../services/neo4j-sync.js';

const overviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(20).max(300).default(120),
  q: z.string().trim().optional(),
  relationType: z.string().trim().optional(),
  isolatedOnly: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform(value => value === true || value === 'true'),
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1),
});

const qualityQuerySchema = z.object({
  limit: z.coerce.number().int().min(10).max(100).default(50),
});

const pathQuerySchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  maxDepth: z.coerce.number().int().min(1).max(6).default(4),
});

const learningPathQuerySchema = z.object({
  targetConceptId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(3).max(20).default(8),
});

export async function graphRoutes(app: FastifyInstance) {
  app.get('/overview', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const query = overviewQuerySchema.parse(request.query ?? {});
    return getGraphOverview(userId, query);
  });

  app.get('/search', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const { q } = searchQuerySchema.parse(request.query ?? {});
    return searchGraph(userId, q);
  });

  app.get('/concepts/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const detail = await getConceptDetail(userId, id);
    if (!detail) return reply.status(404).send({ error: 'Concept not found' });
    return detail;
  });

  app.get('/concepts/:id/neighborhood', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const graph = await getConceptNeighborhood(userId, id);
    if (!graph) return reply.status(404).send({ error: 'Concept not found' });
    return graph;
  });

  app.get('/cards/:id/context', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const context = await getCardGraphContext(userId, id);
    if (!context) return reply.status(404).send({ error: 'Card not found' });
    return context;
  });

  app.get('/quality', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const { limit } = qualityQuerySchema.parse(request.query ?? {});
    return getGraphQualityReport(userId, limit);
  });

  app.get('/health', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    return getGraphHealth(userId);
  });

  app.get('/path', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { sourceId, targetId, maxDepth } = pathQuerySchema.parse(request.query ?? {});
    const path = await findConceptPath(userId, sourceId, targetId, maxDepth);
    if (!path) return reply.status(404).send({ error: 'Concept not found' });
    return path;
  });

  app.get('/learning-path', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const { targetConceptId, limit } = learningPathQuerySchema.parse(request.query ?? {});
    return recommendLearningPath(userId, targetConceptId, limit);
  });

  app.post('/sync/neo4j', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    return syncUserGraphToNeo4j(userId);
  });

  app.post('/relations/:id/confirm', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const relation = await confirmGraphRelation(userId, id);
    if (!relation) return reply.status(404).send({ error: 'Relation not found' });
    return relation;
  });

  app.delete('/relations/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };
    const relation = await deleteGraphRelation(userId, id);
    if (!relation) return reply.status(404).send({ error: 'Relation not found' });
    return relation;
  });
}
