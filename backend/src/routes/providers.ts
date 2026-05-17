import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { aiProviderConfigs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getProviderModels } from '../services/ai-provider.js';
import { encrypt } from '../utils/crypto.js';

const configSchema = z.object({
  providerType: z.enum(['openai', 'deepseek', 'zhipu', 'moonshot']),
  apiKey: z.string().min(1),
  baseUrl: z.string().optional(),
});

export async function providerRoutes(app: FastifyInstance) {
  app.get('/models', async () => {
    return getProviderModels();
  });

  app.get('/', { onRequest: [app.authenticate] }, async (request) => {
    return db.select({
      id: aiProviderConfigs.id,
      providerType: aiProviderConfigs.providerType,
      baseUrl: aiProviderConfigs.baseUrl,
      isActive: aiProviderConfigs.isActive,
      createdAt: aiProviderConfigs.createdAt,
    }).from(aiProviderConfigs).where(eq(aiProviderConfigs.userId, request.user!.id));
  });

  app.post('/', { onRequest: [app.authenticate] }, async (request) => {
    const body = configSchema.parse(request.body);
    const userId = request.user!.id;

    await db.update(aiProviderConfigs)
      .set({ isActive: false })
      .where(eq(aiProviderConfigs.userId, userId));

    const [config] = await db.insert(aiProviderConfigs).values({
      userId,
      providerType: body.providerType,
      apiKeyEncrypted: encrypt(body.apiKey),
      baseUrl: body.baseUrl || null,
      isActive: true,
    }).returning();

    return config;
  });

  app.delete('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(aiProviderConfigs).where(eq(aiProviderConfigs.id, id));
    return reply.send({ message: 'Deleted' });
  });
}
