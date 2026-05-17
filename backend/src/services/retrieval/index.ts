import { retrieveVector } from './vector.js';
import { retrieveFullText } from './fulltext.js';
import { reciprocalRankFusion } from './rrf.js';
import { rerankResults } from './rerank.js';
import { db } from '../../db/index.js';
import { userRetrievalSettings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

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

  // Phase 1: Vector + Full-text only (GraphRAG added later)
  const [vectorResults, fullTextResults] = await Promise.all([
    retrieveVector(query, userId, config.vectorTopK),
    retrieveFullText(query, userId, config.fullTextTopK),
  ]);

  // RRF fusion
  const fused = reciprocalRankFusion(
    [vectorResults, fullTextResults].filter(list => list.length > 0),
    config.rrfK
  );
  const topFused = fused.slice(0, config.rrfTopN);

  // Rerank (if enabled)
  let finalResults;
  if (config.rerankEnabled && config.rerankModel) {
    finalResults = await rerankResults(query, topFused, config.rerankModel, userId, config.rerankTopN);
  } else {
    finalResults = topFused.slice(0, config.rerankTopN);
  }

  return formatContext(finalResults, config.contextBudgetTokens);
}

function formatContext(results: RetrievalResult[], budget: number): string {
  if (results.length === 0) return '';

  let context = '';
  let tokens = 0;
  const approxTokensPerChar = 0.5;

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

import type { RetrievalResult } from './vector.js';
