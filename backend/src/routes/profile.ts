import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getDomainMastery,
  getOrCreateProfile,
  getProfileSummary,
  getWeakPoints,
  recomputeProfile,
} from '../services/profile-service.js';

const weakPointQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function profileRoutes(app: FastifyInstance) {
  app.get('/', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const [profile, mastery, weak] = await Promise.all([
      getOrCreateProfile(userId),
      getDomainMastery(userId),
      getWeakPoints(userId, 10),
    ]);

    return {
      profile,
      domainMastery: mastery,
      weakPoints: weak,
    };
  });

  app.post('/recompute', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    return recomputeProfile(userId);
  });

  app.get('/summary', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    return {
      summary: await getProfileSummary(userId),
    };
  });

  app.get('/domain-mastery', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    return {
      domainMastery: await getDomainMastery(userId),
    };
  });

  app.get('/weak-points', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const { limit } = weakPointQuerySchema.parse(request.query ?? {});
    return {
      weakPoints: await getWeakPoints(userId, limit),
    };
  });
}
