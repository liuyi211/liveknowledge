import { retrieveVector } from './vector.js';
import { retrieveFullText } from './fulltext.js';
import { reciprocalRankFusion } from './rrf.js';
import { rerankResults } from './rerank.js';
import { localSearch, globalSearch } from '../graphrag/query.js';
import { extractEntitiesAndRelations } from '../graphrag/extract.js';
import { db } from '../../db/index.js';
import { userRetrievalSettings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { RetrievalResult } from './vector.js';

export async function retrieveContext(query: string, userId: string): Promise<string> {
  const [settings] = await db.select().from(userRetrievalSettings)
    .where(eq(userRetrievalSettings.userId, userId))
    .limit(1);

  const config = settings || {
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

  // Get default model for entity extraction
  const { getDefaultChatModel } = await import('../ai-provider.js');
  let defaultModel: string | undefined;
  try {
    const defaultConfig = await getDefaultChatModel(userId);
    defaultModel = defaultConfig.model;
  } catch {
    // No default model configured
  }

  // Extract entities from query for Local Search
  let localResults: RetrievalResult[] = [];
  let relationPaths: string[] = [];
  if (defaultModel) {
    try {
      const extraction = await extractEntitiesAndRelations(query, defaultModel, userId);
      const entities = extraction.entities.map(e => e.name);
      if (entities.length > 0) {
        const local = await localSearch(entities, config.localSearchTopK);
        localResults = local.results;
        relationPaths = local.paths;
      }
    } catch {
      // GraphRAG query failed, continue without it
    }
  }

  // 4-way parallel retrieval
  const [vectorResults, fullTextResults, globalResults] = await Promise.all([
    retrieveVector(query, userId, config.vectorTopK),
    retrieveFullText(query, userId, config.fullTextTopK),
    globalSearch([], config.globalSearchTopK),
  ]);

  // RRF fusion with 4 roads
  const allLists = [vectorResults, fullTextResults, localResults, globalResults]
    .filter(list => list.length > 0);

  const fused = reciprocalRankFusion(allLists, config.rrfK);
  const topFused = fused.slice(0, config.rrfTopN);

  // Rerank (if enabled)
  let finalResults;
  if (config.rerankEnabled && config.rerankModel) {
    finalResults = await rerankResults(query, topFused, config.rerankModel, userId, config.rerankTopN);
  } else {
    finalResults = topFused.slice(0, config.rerankTopN);
  }

  return formatContext(finalResults, relationPaths, config.contextBudgetTokens);
}

function formatContext(results: RetrievalResult[], paths: string[], budget: number): string {
  if (results.length === 0 && paths.length === 0) return '';

  let context = '';
  let tokens = 0;
  const approxTokensPerChar = 0.5;

  // Add relation paths
  if (paths.length > 0) {
    const pathsText = `[来自知识图谱的关系路径]\n${paths.join('\n')}\n\n`;
    context += pathsText;
    tokens += pathsText.length * approxTokensPerChar;
  }

  // Add retrieved chunks
  for (let i = 0; i < results.length; i++) {
    const title = results[i].metadata?.title;
    const chunk = `[${i + 1}] ${title ? `来自《${title}》：` : ''}\n${results[i].content}\n\n`;
    const chunkTokens = chunk.length * approxTokensPerChar;

    if (tokens + chunkTokens > budget) break;

    context += chunk;
    tokens += chunkTokens;
  }

  return `以下是从知识库中检索到的相关内容：\n\n${context}`;
}
