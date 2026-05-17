import type { RetrievalResult } from './vector.js';
import { chat } from '../ai-provider.js';
import type { FastifyBaseLogger } from 'fastify';

export interface RerankResult extends RetrievalResult {
  relevanceScore: number;
}

// Simple console logger for reranking
const rerankLogger: FastifyBaseLogger = {
  info: () => {},
  error: console.error,
  warn: console.warn,
  debug: () => {},
  trace: () => {},
  fatal: console.error,
  child: () => rerankLogger,
  silent: () => {},
} as any;

export async function rerankResults(
  query: string,
  results: RetrievalResult[],
  model: string,
  userId: string,
  topN: number
): Promise<RerankResult[]> {
  const scores = await Promise.all(
    results.map(async (result) => {
      const prompt = `请判断以下文档片段是否能帮助回答用户问题。

用户问题：${query}
文档片段：${result.content.slice(0, 500)}

请输出一个 0-10 的相关性分数：
- 10：文档直接回答了问题
- 5：文档部分相关，有参考价值
- 0：文档完全不相关

只输出数字，不要解释。`;

      try {
        const response = await chat(userId, {
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          maxTokens: 10,
        }, rerankLogger);
        const score = parseInt(response.content.trim()) || 0;
        return { ...result, relevanceScore: Math.max(0, Math.min(10, score)) };
      } catch {
        return { ...result, relevanceScore: 5 };
      }
    })
  );

  return scores
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topN);
}
