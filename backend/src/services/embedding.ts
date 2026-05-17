import { db } from '../db/index.js';
import { embeddings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { generateEmbeddingsBatch } from './ai-provider.js';

export async function storeNoteEmbeddings(
  chunks: Array<{ content: string; metadata: any }>,
  userId: string,
  sourceId: string
): Promise<void> {
  const batchSize = 100;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.content);

    const vectors = await generateEmbeddingsBatch(texts, userId);

    const records = batch.map((chunk, idx) => ({
      userId,
      sourceType: 'note' as const,
      sourceId,
      chunkIndex: i + idx,
      content: chunk.content,
      metadata: chunk.metadata,
      embedding: vectors[idx],
    }));

    await db.insert(embeddings).values(records);
  }
}

export async function deleteNoteEmbeddings(sourceId: string): Promise<void> {
  await db.delete(embeddings).where(eq(embeddings.sourceId, sourceId));
}
