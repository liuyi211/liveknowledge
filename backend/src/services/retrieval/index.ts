import { db } from '../../db/index.js';
import { userRetrievalSettings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { generateEmbedding, getDefaultChatModel } from '../ai-provider.js';
import { extractEntitiesAndRelations } from '../graphrag/extract.js';
import { globalSearch, localSearch } from '../graphrag/query.js';
import { retrieveFullText } from './fulltext.js';
import { reciprocalRankFusion } from './rrf.js';
import { rerankResults } from './rerank.js';
import { rewriteQuery, type RewrittenQuery } from './query-rewrite.js';
import { retrieveVector, retrieveVectorByEmbedding, type RetrievalResult } from './vector.js';

const DEFAULT_RETRIEVAL_CONFIG = {
  vectorTopK: 10,
  fullTextTopK: 10,
  localSearchTopK: 10,
  globalSearchTopK: 5,
  rrfK: 60,
  rrfTopN: 10,
  rerankEnabled: true,
  rerankModel: null as string | null,
  rerankProviderConfigId: null as string | null,
  rerankTopN: 5,
  contextBudgetTokens: 1500,
};

export async function retrieveContext(query: string, userId: string, sessionSummary?: string | null): Promise<string> {
  const result = await retrieveContextDetailed(query, userId, sessionSummary);
  return result.context;
}

export async function retrieveContextDetailed(query: string, userId: string, sessionSummary?: string | null) {
  const [settings] = await db.select().from(userRetrievalSettings)
    .where(eq(userRetrievalSettings.userId, userId))
    .limit(1);

  const config = {
    vectorTopK: settings?.vectorTopK ?? DEFAULT_RETRIEVAL_CONFIG.vectorTopK,
    fullTextTopK: settings?.fullTextTopK ?? DEFAULT_RETRIEVAL_CONFIG.fullTextTopK,
    localSearchTopK: settings?.localSearchTopK ?? DEFAULT_RETRIEVAL_CONFIG.localSearchTopK,
    globalSearchTopK: settings?.globalSearchTopK ?? DEFAULT_RETRIEVAL_CONFIG.globalSearchTopK,
    rrfK: settings?.rrfK ?? DEFAULT_RETRIEVAL_CONFIG.rrfK,
    rrfTopN: settings?.rrfTopN ?? DEFAULT_RETRIEVAL_CONFIG.rrfTopN,
    rerankEnabled: settings?.rerankEnabled ?? DEFAULT_RETRIEVAL_CONFIG.rerankEnabled,
    rerankModel: settings?.rerankModel ?? DEFAULT_RETRIEVAL_CONFIG.rerankModel,
    rerankProviderConfigId: settings?.rerankProviderConfigId ?? DEFAULT_RETRIEVAL_CONFIG.rerankProviderConfigId,
    rerankTopN: settings?.rerankTopN ?? DEFAULT_RETRIEVAL_CONFIG.rerankTopN,
    contextBudgetTokens: settings?.contextBudgetTokens ?? DEFAULT_RETRIEVAL_CONFIG.contextBudgetTokens,
  };

  const rewritten = await rewriteQuery(query, userId, sessionSummary);
  const searchQueries = buildSearchQueries(rewritten);

  let defaultModel: string | undefined;
  try {
    defaultModel = (await getDefaultChatModel(userId)).model;
  } catch {
    defaultModel = undefined;
  }

  let localResults: RetrievalResult[] = [];
  let relationPaths: string[] = [];
  if (defaultModel) {
    try {
      const extraction = await extractEntitiesAndRelations(rewritten.rewrittenQuery, defaultModel, userId);
      const entities = extraction.entities.map(e => e.name).filter(Boolean);
      if (entities.length > 0) {
        const local = await localSearch(entities, config.localSearchTopK);
        localResults = local.results;
        relationPaths = local.paths;
      }
    } catch {
      localResults = [];
      relationPaths = [];
    }
  }

  const [vectorResults, fullTextResults, hydeResults, globalResults] = await Promise.all([
    collectVectorResults(searchQueries, userId, config.vectorTopK),
    collectFullTextResults(searchQueries, userId, config.fullTextTopK),
    rewritten.hyde
      ? generateEmbedding(rewritten.hyde, userId)
        .then(vector => retrieveVectorByEmbedding(vector, userId, Math.max(3, Math.ceil(config.vectorTopK / 2))))
        .catch(() => [])
      : Promise.resolve([]),
    globalSearch([], config.globalSearchTopK).catch(() => []),
  ]);

  const allLists = [vectorResults, fullTextResults, hydeResults, localResults, globalResults]
    .filter(list => list.length > 0);

  const fused = reciprocalRankFusion(allLists, config.rrfK).slice(0, config.rrfTopN);

  const finalResults = config.rerankEnabled && config.rerankModel
    ? await rerankResults(rewritten.rewrittenQuery, fused, config.rerankModel, userId, config.rerankTopN)
    : fused.slice(0, config.rerankTopN);

  const context = formatContext(finalResults, relationPaths, config.contextBudgetTokens, rewritten);

  return {
    rewritten,
    counts: {
      vector: vectorResults.length,
      fullText: fullTextResults.length,
      hyde: hydeResults.length,
      localGraph: localResults.length,
      globalGraph: globalResults.length,
      fused: fused.length,
      final: finalResults.length,
    },
    relationPaths,
    results: finalResults,
    context,
  };
}

function buildSearchQueries(rewritten: RewrittenQuery): string[] {
  return Array.from(new Set([
    rewritten.rewrittenQuery,
    ...rewritten.subQueries,
    rewritten.keywords.join(' '),
  ].map(value => value.trim()).filter(Boolean)));
}

async function collectVectorResults(queries: string[], userId: string, topK: number): Promise<RetrievalResult[]> {
  const perQueryTopK = Math.max(3, Math.ceil(topK / Math.max(1, Math.min(queries.length, 3))));
  const lists = await Promise.all(
    queries.slice(0, 3).map(query => retrieveVector(query, userId, perQueryTopK).catch(() => []))
  );
  return dedupeResults(lists.flat()).slice(0, topK);
}

async function collectFullTextResults(queries: string[], userId: string, topK: number): Promise<RetrievalResult[]> {
  const lists = await Promise.all(
    queries.slice(0, 4).map(query => retrieveFullText(query, userId, topK).catch(() => []))
  );
  return dedupeResults(lists.flat()).slice(0, topK);
}

function dedupeResults(results: RetrievalResult[]): RetrievalResult[] {
  const seen = new Set<string>();
  const deduped: RetrievalResult[] = [];
  for (const result of results) {
    const key = `${result.sourceId}:${result.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}

function formatContext(
  results: RetrievalResult[],
  paths: string[],
  budget: number,
  rewritten: RewrittenQuery
): string {
  if (results.length === 0 && paths.length === 0) return '';

  let context = '';
  let tokens = 0;
  const approxTokensPerChar = 0.5;
  const seenSources = new Set<string>();

  const queryMeta = [
    `检索查询：${rewritten.rewrittenQuery}`,
    rewritten.keywords.length > 0 ? `关键词：${rewritten.keywords.join('、')}` : '',
    `意图：${rewritten.intent}`,
  ].filter(Boolean).join('\n');
  context += `${queryMeta}\n\n`;
  tokens += queryMeta.length * approxTokensPerChar;

  if (paths.length > 0) {
    const pathsText = `[来自知识图谱的关系路径]\n${paths.join('\n')}\n\n`;
    context += pathsText;
    tokens += pathsText.length * approxTokensPerChar;
  }

  for (const result of results) {
    if (seenSources.has(result.sourceId)) continue;
    seenSources.add(result.sourceId);

    const title = result.metadata?.title;
    const headingPath = Array.isArray(result.metadata?.headingPath) && result.metadata.headingPath.length > 0
      ? ` / ${result.metadata.headingPath.join(' / ')}`
      : '';
    const chunk = `[${seenSources.size}] ${title ? `来自《${title}》${headingPath}：` : ''}\n${result.content}\n\n`;
    const chunkTokens = chunk.length * approxTokensPerChar;

    if (tokens + chunkTokens > budget) break;

    context += chunk;
    tokens += chunkTokens;
  }

  return `以下是从知识库中检索到的相关内容。请优先依据这些内容回答；如果内容不足，请明确说明不足之处。\n\n${context}`;
}
