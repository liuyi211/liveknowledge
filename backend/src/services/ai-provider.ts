import OpenAI from 'openai';
import { db } from '../db/index.js';
import { aiProviderConfigs } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../utils/crypto.js';
import type { FastifyBaseLogger } from 'fastify';

export interface ChatMessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatMessageContent[];
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  providerType?: string;
}

export interface StreamChunk {
  type: 'content' | 'thinking';
  content: string;
}

export const PROVIDER_MODELS: Record<string, { baseURL: string; models: string[]; supportsVision?: boolean }> = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    supportsVision: true,
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  zhipu: {
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus'],
    supportsVision: true,
  },
  moonshot: {
    baseURL: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    supportsVision: true,
  },
  bailian: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-coder-plus'],
    supportsVision: true,
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

export function supportsVision(model: string): boolean {
  const provider = detectProvider(model);
  if (!provider) return false;
  return PROVIDER_MODELS[provider]?.supportsVision ?? false;
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

export async function getDefaultChatModel(userId: string): Promise<{ model: string; providerType: string }> {
  const [config] = await db.select().from(aiProviderConfigs)
    .where(and(
      eq(aiProviderConfigs.userId, userId),
      eq(aiProviderConfigs.purpose, 'chat'),
      eq(aiProviderConfigs.isActive, true)
    )).limit(1);

  if (!config) {
    throw new Error('未配置对话模型，请先在设置中配置 AI Provider');
  }

  const model = config.model || PROVIDER_MODELS[config.providerType]?.models[0];
  if (!model) {
    throw new Error(`Provider ${config.providerType} 没有可用的模型，请在设置中明确指定`);
  }

  return { model, providerType: config.providerType };
}

export async function* streamChat(
  userId: string,
  options: ChatOptions,
  log: FastifyBaseLogger,
  abortSignal?: AbortSignal
): AsyncGenerator<StreamChunk, void, unknown> {
  const providerType = options.providerType || detectProvider(options.model);
  if (!providerType) {
    throw new Error(`Unknown model: ${options.model}`);
  }

  const client = await createProviderClient(userId, providerType);
  const startTime = Date.now();

  log.debug({ provider: providerType, model: options.model }, 'AI: provider call start');

  try {
    const stream = await client.chat.completions.create({
      model: options.model,
      messages: options.messages as any,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: true,
    }, { signal: abortSignal });

    let chunkCount = 0;

    for await (const chunk of stream) {
      if (abortSignal?.aborted) break;

      // DeepSeek reasoning content
      const reasoning = (chunk.choices[0]?.delta as any)?.reasoning_content;
      if (reasoning) {
        yield { type: 'thinking', content: reasoning };
      }

      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        chunkCount++;
        log.debug({ chunk: chunkCount, length: content.length }, 'AI: stream chunk');
        yield { type: 'content', content };
      }
    }

    const duration = Date.now() - startTime;
    log.debug({ duration, chunkCount }, 'AI: provider call done');
  } catch (err) {
    if ((err as any).name === 'AbortError') {
      log.info('AI: stream aborted by user');
      return;
    }
    log.error({ err }, 'AI: provider call failed');
    throw err;
  }
}

export async function chat(userId: string, options: ChatOptions, log: FastifyBaseLogger): Promise<{ content: string; thinkingContent?: string }> {
  const providerType = options.providerType || detectProvider(options.model);
  if (!providerType) {
    throw new Error(`Unknown model: ${options.model}`);
  }

  const client = await createProviderClient(userId, providerType);
  const startTime = Date.now();

  log.debug({ provider: providerType, model: options.model }, 'AI: provider call start');

  try {
    const response = await client.chat.completions.create({
      model: options.model,
      messages: options.messages as any,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: false,
    });

    const message = response.choices[0]?.message;
    const content = message?.content || '';
    const thinkingContent = (message as any)?.reasoning_content;

    const duration = Date.now() - startTime;
    log.debug({ duration, tokens: response.usage?.total_tokens }, 'AI: provider call done');

    return { content, thinkingContent };
  } catch (err) {
    log.error({ err }, 'AI: provider call failed');
    throw err;
  }
}

export async function generateEmbedding(text: string, userId: string, model?: string): Promise<number[]> {
  // Default to bailian text-embedding-v4
  const embeddingModel = model || 'text-embedding-v3';
  const providerType = 'bailian';

  const client = await createProviderClient(userId, providerType, 'embedding');

  const response = await client.embeddings.create({
    model: embeddingModel,
    input: text,
  });

  return response.data[0].embedding;
}

export async function generateEmbeddingsBatch(texts: string[], userId: string, model?: string): Promise<number[][]> {
  const embeddingModel = model || 'text-embedding-v3';
  const providerType = 'bailian';

  const client = await createProviderClient(userId, providerType, 'embedding');

  const response = await client.embeddings.create({
    model: embeddingModel,
    input: texts,
  });

  return response.data.map(d => d.embedding);
}
