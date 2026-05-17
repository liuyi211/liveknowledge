import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { aiProviderConfigs } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getProviderModels } from '../services/ai-provider.js';
import { encrypt } from '../utils/crypto.js';
import OpenAI from 'openai';

const configSchema = z.object({
  providerType: z.enum(['openai', 'deepseek', 'zhipu', 'moonshot', 'bailian']),
  apiKey: z.string().default(''),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  purpose: z.enum(['chat', 'embedding']).default('chat'),
});

const testSchema = z.object({
  providerType: z.enum(['openai', 'deepseek', 'zhipu', 'moonshot', 'bailian']),
  apiKey: z.string().min(1),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  purpose: z.enum(['chat', 'embedding']).default('chat'),
});

const PROVIDER_MODELS: Record<string, { baseURL: string }> = {
  openai: { baseURL: 'https://api.openai.com/v1' },
  deepseek: { baseURL: 'https://api.deepseek.com/v1' },
  zhipu: { baseURL: 'https://open.bigmodel.cn/api/paas/v4' },
  moonshot: { baseURL: 'https://api.moonshot.cn/v1' },
  bailian: { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
};

export async function providerRoutes(app: FastifyInstance) {
  // Get available models for all providers
  app.get('/models', async () => {
    return getProviderModels();
  });

  // List configs for current user
  app.get('/', { onRequest: [app.authenticate] }, async (request) => {
    return db.select({
      id: aiProviderConfigs.id,
      providerType: aiProviderConfigs.providerType,
      baseUrl: aiProviderConfigs.baseUrl,
      model: aiProviderConfigs.model,
      purpose: aiProviderConfigs.purpose,
      isActive: aiProviderConfigs.isActive,
      createdAt: aiProviderConfigs.createdAt,
    }).from(aiProviderConfigs).where(eq(aiProviderConfigs.userId, request.user!.id));
  });

  // Create or update config
  app.post('/', { onRequest: [app.authenticate] }, async (request) => {
    const body = configSchema.parse(request.body);
    const userId = request.user!.id;

    // Find existing config to reuse apiKey if not provided
    const [existing] = await db.select()
      .from(aiProviderConfigs)
      .where(and(
        eq(aiProviderConfigs.userId, userId),
        eq(aiProviderConfigs.purpose, body.purpose),
        eq(aiProviderConfigs.isActive, true)
      )).limit(1);

    let apiKeyEncrypted: string;
    if (body.apiKey) {
      apiKeyEncrypted = encrypt(body.apiKey);
    } else if (existing) {
      apiKeyEncrypted = existing.apiKeyEncrypted;
    } else {
      throw new Error('API Key is required');
    }

    // Deactivate existing config for same user + purpose
    await db.update(aiProviderConfigs)
      .set({ isActive: false })
      .where(and(
        eq(aiProviderConfigs.userId, userId),
        eq(aiProviderConfigs.purpose, body.purpose)
      ));

    const [config] = await db.insert(aiProviderConfigs).values({
      userId,
      providerType: body.providerType,
      apiKeyEncrypted,
      baseUrl: body.baseUrl || null,
      model: body.model || null,
      purpose: body.purpose,
      isActive: true,
    }).returning();

    return {
      id: config.id,
      providerType: config.providerType,
      baseUrl: config.baseUrl,
      model: config.model,
      purpose: config.purpose,
      isActive: config.isActive,
      createdAt: config.createdAt,
    };
  });

  // Test connection to provider
  app.post('/test', { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = testSchema.parse(request.body);

    try {
      const providerConfig = PROVIDER_MODELS[body.providerType];
      const baseURL = body.baseUrl || providerConfig?.baseURL;

      const client = new OpenAI({
        apiKey: body.apiKey,
        baseURL,
      });

      if (body.purpose === 'embedding') {
        // Test with embeddings API
        const response = await client.embeddings.create({
          model: body.model || 'text-embedding-v4',
          input: 'test',
        });
        return {
          success: true,
          message: '连接成功',
          model: response.model,
        };
      }

      // Test with chat completions API
      const response = await client.chat.completions.create({
        model: body.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      });

      return {
        success: true,
        message: '连接成功',
        model: response.model,
      };
    } catch (err) {
      reply.status(400);
      return {
        success: false,
        message: (err as Error).message,
      };
    }
  });

  app.delete('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(aiProviderConfigs).where(eq(aiProviderConfigs.id, id));
    return reply.send({ message: 'Deleted' });
  });
}
