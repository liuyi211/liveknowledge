import { db } from '../db/index.js';
import { embeddings, notes } from '../db/schema.js';
import { eq, sql, desc } from 'drizzle-orm';
import { chat, getDefaultChatModel } from './ai-provider.js';
import type { FastifyBaseLogger } from 'fastify';

interface RetrieveOptions {
  userId: string;
  query: string;
  topK?: number;
}

interface RetrievedChunk {
  id: string;
  content: string;
  sourceType: string;
  sourceId: string;
  similarity: number;
}

/**
 * Rewrite user query for better retrieval
 */
export async function rewriteQuery(userId: string, query: string, log: FastifyBaseLogger, sessionTopic?: string): Promise<string> {
  const prompt = `你是一个查询优化助手。请将用户的输入改写为更适合知识库检索的查询。

规则：
1. 去除口语化表达
2. 提取核心概念和关键词
3. 保留原始问题的核心意图

${sessionTopic ? `当前会话主题：${sessionTopic}` : ''}

用户输入："${query}"

只输出改写后的查询，不要解释。`;

  try {
    const defaultConfig = await getDefaultChatModel(userId);
    const result = await chat(userId, {
      model: defaultConfig.model,
      providerType: defaultConfig.providerType,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 200,
    }, log);
    return result.content.trim() || query;
  } catch {
    return query;
  }
}

/**
 * Retrieve relevant chunks using vector similarity
 */
export async function retrieveVector(options: RetrieveOptions, log: FastifyBaseLogger): Promise<RetrievedChunk[]> {
  const { userId, query, topK = 10 } = options;

  // MVP fallback: use full-text search since embedding generation is async
  log.debug({ query }, 'RAG: vector search (fallback to recent notes)');

  const recentNotes = await db.select({
    id: notes.id,
    content: notes.content,
    title: notes.title,
  }).from(notes)
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt))
    .limit(topK);

  return recentNotes.map(note => ({
    id: note.id,
    content: note.title + '\n' + note.content.slice(0, 500),
    sourceType: 'note',
    sourceId: note.id,
    similarity: 0.5,
  }));
}

/**
 * Retrieve using full-text search
 */
export async function retrieveFullText(options: RetrieveOptions, log: FastifyBaseLogger): Promise<RetrievedChunk[]> {
  const { userId, query, topK = 10 } = options;

  log.debug({ query }, 'RAG: full-text search');

  // Simple LIKE search for MVP - will use tsvector in production
  const results = await db.select({
    id: notes.id,
    content: notes.content,
    title: notes.title,
  }).from(notes)
    .where(eq(notes.userId, userId))
    .limit(topK);

  // Filter client-side for MVP
  const queryWords = query.toLowerCase().split(/\s+/);
  const filtered = results.filter(note => {
    const text = (note.title + ' ' + note.content).toLowerCase();
    return queryWords.some(word => text.includes(word));
  });

  return filtered.map(note => ({
    id: note.id,
    content: note.title + '\n' + note.content.slice(0, 500),
    sourceType: 'note',
    sourceId: note.id,
    similarity: 0.3,
  }));
}

/**
 * Combine vector and full-text results
 */
export async function retrieve(options: RetrieveOptions, log: FastifyBaseLogger): Promise<RetrievedChunk[]> {
  const [vectorResults, textResults] = await Promise.all([
    retrieveVector(options, log),
    retrieveFullText(options, log),
  ]);

  // Merge: deduplicate by sourceId, keep highest similarity
  const merged = new Map<string, RetrievedChunk>();

  for (const r of [...vectorResults, ...textResults]) {
    const existing = merged.get(r.sourceId);
    if (!existing || r.similarity > existing.similarity) {
      merged.set(r.sourceId, r);
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, options.topK || 5);
}

/**
 * Format retrieved chunks as context string
 */
export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '';

  return chunks.map((chunk, i) =>
    `[${i + 1}] ${chunk.content.slice(0, 1000)}`
  ).join('\n\n');
}
