import { db } from '../../db/index.js';
import { notes } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import type { RetrievalResult } from './vector.js';

export async function retrieveFullText(query: string, userId: string, topK: number): Promise<RetrievalResult[]> {
  const keywords = query.trim().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) return [];

  const results = await db.execute(sql`
    SELECT id, title, content,
           ts_rank(search_vector, plainto_tsquery('simple', ${query})) AS rank
    FROM notes
    WHERE user_id = ${userId}
      AND search_vector @@ plainto_tsquery('simple', ${query})
    ORDER BY rank DESC
    LIMIT ${topK}
  `);

  return ((results as any).rows || results).map((row: any) => ({
    id: row.id,
    content: row.content,
    metadata: { title: row.title, sourceType: 'note' },
    similarity: parseFloat(row.rank || row.similarity || 0),
    sourceId: row.id,
  }));
}
