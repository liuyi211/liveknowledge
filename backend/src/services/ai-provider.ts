import OpenAI from 'openai';
import { db } from '../db/index.js';
import { aiProviderConfigs } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../utils/crypto.js';
import type { FastifyBaseLogger } from 'fastify';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

const PROVIDER_MODELS: Record<string, { baseURL: string; models: string[] }> = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  zhipu: {
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus'],
  },
  moonshot: {
    baseURL: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  bailian: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-coder-plus'],
  },
};

export function detectProvider(model: string): string | null {
  for (const [provider, config] of Object.entries(PROVIDER_MODELS)) {
    if (config.models.includes(model)) return provider;
  }
  return null;
}

export function getProviderModels(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [provider, config] of Object.entries(PROVIDER_MODELS)) {
    result[provider] = config.models;
  }
  return result;
}

export async function createProviderClient(userId: string, providerType: string, purpose: string = 'chat') {
  const [config] = await db.select().from(aiProviderConfigs)
    .where(and(
      eq(aiProviderConfigs.userId, userId),
      eq(aiProviderConfigs.providerType, providerType),
      eq(aiProviderConfigs.purpose, purpose),
      eq(aiProviderConfigs.isActive, true)
    )).limit(1);

  if (!config) {
    throw new Error(`No active ${purpose} provider config found for ${providerType}. Please configure your API key first.`);
  }

  const providerConfig = PROVIDER_MODELS[providerType];
  const baseURL = config.baseUrl || providerConfig?.baseURL;

  const apiKey = decrypt(config.apiKeyEncrypted);

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

export async function* streamChat(
  userId: string,
  options: ChatOptions,
  log: FastifyBaseLogger
): AsyncGenerator<string, void, unknown> {
  const providerType = detectProvider(options.model);
  if (!providerType) {
    throw new Error(`Unknown model: ${options.model}`);
  }

  const client = await createProviderClient(userId, providerType);
  const startTime = Date.now();

  log.info({ provider: providerType, model: options.model }, 'AI: provider call start');

  try {
    const stream = await client.chat.completions.create({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: true,
    });

    let chunkCount = 0;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        chunkCount++;
        log.debug({ chunk: chunkCount, length: content.length }, 'AI: stream chunk');
        yield content;
      }
    }

    const duration = Date.now() - startTime;
    log.info({ duration, chunkCount }, 'AI: provider call done');
  } catch (err) {
    log.error({ err }, 'AI: provider call failed');
    throw err;
  }
}

export async function chat(userId: string, options: ChatOptions, log: FastifyBaseLogger): Promise<string> {
  const providerType = detectProvider(options.model);
  if (!providerType) {
    throw new Error(`Unknown model: ${options.model}`);
  }

  const client = await createProviderClient(userId, providerType);
  const startTime = Date.now();

  log.info({ provider: providerType, model: options.model }, 'AI: provider call start');

  try {
    const response = await client.chat.completions.create({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: false,
    });

    const content = response.choices[0]?.message?.content || '';
    const duration = Date.now() - startTime;
    log.info({ duration, tokens: response.usage?.total_tokens }, 'AI: provider call done');

    return content;
  } catch (err) {
    log.error({ err }, 'AI: provider call failed');
    throw err;
  }
}
