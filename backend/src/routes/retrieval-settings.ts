import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { userRetrievalSettings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const defaultSettings = {
  vectorTopK: 10,
  fullTextTopK: 10,
  localSearchTopK: 10,
  globalSearchTopK: 5,
  rrfK: 60,
  rrfTopN: 10,
  rerankEnabled: true,
  rerankModel: null,
  rerankProviderConfigId: null,
  rerankTopN: 5,
  contextBudgetTokens: 1500,
};

export async function retrievalSettingsRoutes(app: FastifyInstance) {
  app.get('/settings', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const [settings] = await db.select().from(userRetrievalSettings)
      .where(eq(userRetrievalSettings.userId, userId))
      .limit(1);

    return settings || defaultSettings;
  });

  app.put('/settings', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const body = request.body as any;

    await db.insert(userRetrievalSettings)
      .values({ userId, ...body, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userRetrievalSettings.userId,
        set: { ...body, updatedAt: new Date() },
      });

    return { success: true };
  });
}
