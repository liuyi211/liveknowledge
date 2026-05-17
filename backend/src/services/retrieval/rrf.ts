import type { RetrievalResult } from './vector.js';

export interface FusionResult extends RetrievalResult {
  rrfScore: number;
}

export function reciprocalRankFusion(
  resultsLists: RetrievalResult[][],
  k: number = 60
): FusionResult[] {
  const scores = new Map<string, number>();
  const docs = new Map<string, RetrievalResult>();

  for (const results of resultsLists) {
    for (let rank = 0; rank < results.length; rank++) {
      const doc = results[rank];
      docs.set(doc.sourceId, doc);
      const current = scores.get(doc.sourceId) || 0;
      scores.set(doc.sourceId, current + 1 / (k + rank + 1));
    }
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([sourceId, score]) => ({
      ...docs.get(sourceId)!,
      rrfScore: score,
    }));
}
