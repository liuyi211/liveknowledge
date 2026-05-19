import { db } from '../../db/index.js';
import { notes } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import type { RetrievalResult } from './vector.js';

export async function retrieveFullText(query: string, userId: string, topK: number): Promise<RetrievalResult[]> {
  const keywords = query.trim().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) return [];

  const tsResults = await db.execute(sql`
    SELECT id, title, content,
           ts_rank(search_vector, plainto_tsquery('simple', ${query})) AS rank
    FROM notes
    WHERE user_id = ${userId}
      AND search_vector @@ plainto_tsquery('simple', ${query})
    ORDER BY rank DESC
    LIMIT ${topK}
  `);

  const mapped = ((tsResults as any).rows || tsResults).map((row: any) => ({
    id: row.id,
    content: trimContent(row.content, query),
    metadata: { title: row.title, sourceType: 'note' },
    similarity: parseFloat(row.rank || row.similarity || 0),
    sourceId: row.id,
  }));

  if (mapped.length > 0) return mapped;

  const likePattern = `%${query.trim()}%`;
  const fallbackResults = await db.execute(sql`
    SELECT id, title, content,
           CASE
             WHEN title ILIKE ${likePattern} THEN 1.0
             ELSE 0.5
           END AS rank
    FROM notes
    WHERE user_id = ${userId}
      AND (
        title ILIKE ${likePattern}
        OR content ILIKE ${likePattern}
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(tags, ARRAY[]::text[])) AS tag
          WHERE tag ILIKE ${likePattern}
        )
      )
    ORDER BY rank DESC, updated_at DESC
    LIMIT ${topK}
  `);

  return ((fallbackResults as any).rows || fallbackResults).map((row: any) => ({
    id: row.id,
    content: trimContent(row.content, query),
    metadata: { title: row.title, sourceType: 'note', fallback: 'ilike' },
    similarity: parseFloat(row.rank || 0),
    sourceId: row.id,
  }));
}

function trimContent(content: string, query: string, maxLength = 1200): string {
  if (content.length <= maxLength) return content;
  const idx = content.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx < 0) return `${content.slice(0, maxLength)}...`;
  const start = Math.max(0, idx - Math.floor(maxLength / 3));
  return `${start > 0 ? '...' : ''}${content.slice(start, start + maxLength)}...`;
}
