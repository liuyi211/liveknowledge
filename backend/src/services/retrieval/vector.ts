import { db } from '../../db/index.js';
import { embeddings } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { generateEmbedding } from '../ai-provider.js';

export interface RetrievalResult {
  id: string;
  content: string;
  metadata: any;
  similarity: number;
  sourceId: string;
}

export async function retrieveVector(query: string, userId: string, topK: number): Promise<RetrievalResult[]> {
  const queryVector = await generateEmbedding(query, userId);
  return retrieveVectorByEmbedding(queryVector, userId, topK);
}

export async function retrieveVectorByEmbedding(queryVector: number[], userId: string, topK: number): Promise<RetrievalResult[]> {
  const results = await db.execute(sql`
    SELECT id, content, metadata, source_id,
           1 - (embedding <=> ${sql.raw(`'[${queryVector.join(',')}]'::vector`)}) AS similarity
    FROM embeddings
    WHERE user_id = ${userId} AND source_type = 'note'
    ORDER BY embedding <=> ${sql.raw(`'[${queryVector.join(',')}]'::vector`)}
    LIMIT ${topK}
  `);

  return ((results as any).rows || results).map((row: any) => ({
    id: row.id,
    content: row.content,
    metadata: row.metadata,
    similarity: parseFloat(row.similarity),
    sourceId: row.source_id,
  }));
}
