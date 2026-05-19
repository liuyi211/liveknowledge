import { chat, getDefaultChatModel } from '../ai-provider.js';
import type { ChatMessage } from '../ai-provider.js';
import type { FastifyBaseLogger } from 'fastify';

export interface RewrittenQuery {
  originalQuery: string;
  rewrittenQuery: string;
  keywords: string[];
  subQueries: string[];
  intent: '问答' | '总结' | '对比' | '计算' | '其他';
  hyde?: string;
}

const rewriteLogger: FastifyBaseLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => rewriteLogger,
  silent: () => {},
} as any;

export async function rewriteQuery(
  query: string,
  userId: string,
  sessionSummary?: string | null
): Promise<RewrittenQuery> {
  const fallback = buildFallback(query);

  let model: string;
  try {
    model = (await getDefaultChatModel(userId)).model;
  } catch {
    return fallback;
  }

  const messages: ChatMessage[] = [{
    role: 'user',
    content: `你是一个知识库检索查询优化器。请把用户问题改写为适合检索笔记、卡片和知识图谱的查询。

要求：
1. 去除寒暄和口语噪音。
2. 如果问题里有“这个/它/上面”等指代，请结合会话摘要补全。
3. 输出严格 JSON，不要 Markdown。

会话摘要：
${sessionSummary || '无'}

用户问题：
${query}

JSON 字段：
{
  "rewrittenQuery": "优化后的单句查询",
  "keywords": ["关键词"],
  "subQueries": ["可独立检索的子问题"],
  "intent": "问答|总结|对比|计算|其他"
}`,
  }];

  try {
    const response = await chat(userId, {
      model,
      messages,
      temperature: 0,
      maxTokens: 500,
    }, rewriteLogger);

    const parsed = parseJson(response.content);
    const rewritten = typeof parsed.rewrittenQuery === 'string' && parsed.rewrittenQuery.trim()
      ? parsed.rewrittenQuery.trim()
      : fallback.rewrittenQuery;

    const result: RewrittenQuery = {
      originalQuery: query,
      rewrittenQuery: rewritten,
      keywords: cleanArray(parsed.keywords, fallback.keywords),
      subQueries: cleanArray(parsed.subQueries, fallback.subQueries),
      intent: normalizeIntent(parsed.intent),
    };

    if (shouldUseHyde(query, result)) {
      result.hyde = await generateHydeAnswer(query, userId, model).catch(() => undefined);
    }

    return result;
  } catch {
    return fallback;
  }
}

function buildFallback(query: string): RewrittenQuery {
  const keywords = Array.from(new Set(query.split(/[\s,，。！？!?、]+/).map(v => v.trim()).filter(Boolean)));
  return {
    originalQuery: query,
    rewrittenQuery: query.trim(),
    keywords,
    subQueries: [query.trim()].filter(Boolean),
    intent: '其他',
  };
}

async function generateHydeAnswer(query: string, userId: string, model: string): Promise<string> {
  const response = await chat(userId, {
    model,
    messages: [{
      role: 'user',
      content: `请基于常识写一个 100-200 字的假设答案，用于帮助知识库语义检索。不要求完全准确，不要编造引用。\n\n问题：${query}`,
    }],
    temperature: 0.2,
    maxTokens: 350,
  }, rewriteLogger);

  return response.content.trim();
}

function shouldUseHyde(query: string, rewritten: RewrittenQuery): boolean {
  return query.trim().length <= 18 || rewritten.keywords.length <= 2 || rewritten.intent === '其他';
}

function parseJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  return JSON.parse(match[0]);
}

function cleanArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = Array.from(new Set(value.map(v => String(v).trim()).filter(Boolean)));
  return cleaned.length > 0 ? cleaned : fallback;
}

function normalizeIntent(value: unknown): RewrittenQuery['intent'] {
  if (value === '问答' || value === '总结' || value === '对比' || value === '计算') return value;
  return '其他';
}
