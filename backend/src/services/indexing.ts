import { db } from '../db/index.js';
import { notes } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { splitDocument } from './chunking.js';
import { storeNoteEmbeddings, deleteNoteEmbeddings } from './embedding.js';
import type { FastifyBaseLogger } from 'fastify';

export async function indexNote(noteId: string, userId: string, log: FastifyBaseLogger): Promise<void> {
  const startTime = Date.now();
  const logs: any[] = [];

  try {
    log.info({ noteId }, 'Index: loading note');
    const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
    if (!note) throw new Error('Note not found');

    // Step 1: Chunking
    log.info({ noteId, contentLength: note.content.length }, 'Index: chunking');
    await db.update(notes).set({ indexStatus: 'chunking' }).where(eq(notes.id, noteId));
    const chunkStart = Date.now();
    const chunks = splitDocument(note.content, noteId);
    const enrichedChunks = chunks.map(chunk => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        title: note.title,
        tags: note.tags ?? [],
        sourceType: 'note',
        sourceId: note.id,
        noteVersion: note.version,
        source: note.sourceType
          ? {
            type: note.sourceType,
            id: note.sourceId,
            metadata: note.sourceMetadata,
          }
          : null,
      },
    }));
    log.info({ noteId, chunkCount: chunks.length }, 'Index: chunking done');
    logs.push({
      step: 'chunk',
      status: 'completed',
      timestamp: new Date(),
      detail: { chunk_count: chunks.length, total_chars: note.content.length },
      duration_ms: Date.now() - chunkStart,
    });

    // Step 2: Delete old embeddings
    log.info({ noteId }, 'Index: deleting old embeddings');
    await deleteNoteEmbeddings(noteId);

    // Step 3: Embedding
    log.info({ noteId, chunkCount: chunks.length }, 'Index: embedding');
    await db.update(notes).set({ indexStatus: 'embedding', indexLogs: logs }).where(eq(notes.id, noteId));
    const embedStart = Date.now();
    await storeNoteEmbeddings(
      enrichedChunks.map(c => ({ content: c.content, metadata: c.metadata })),
      userId,
      noteId
    );
    log.info({ noteId, chunkCount: chunks.length }, 'Index: embedding done');
    logs.push({
      step: 'embed',
      status: 'completed',
      timestamp: new Date(),
      detail: { embedded_count: chunks.length },
      duration_ms: Date.now() - embedStart,
    });

    // Step 4: Done
    logs.push({
      step: 'store',
      status: 'completed',
      timestamp: new Date(),
      detail: { deleted_old: true },
      duration_ms: 0,
    });

    await db.update(notes).set({
      indexStatus: 'done',
      indexLogs: logs,
      indexedAt: new Date(),
    }).where(eq(notes.id, noteId));
    log.info({ noteId, durationMs: Date.now() - startTime }, 'Index: completed');

  } catch (error) {
    const err = error as Error;
    log.error({ err, noteId }, 'Index: failed');
    logs.push({
      step: 'index',
      status: 'failed',
      timestamp: new Date(),
      detail: { error: err.message },
      duration_ms: Date.now() - startTime,
    });
    await db.update(notes).set({
      indexStatus: 'failed',
      indexLogs: logs,
      indexError: err.message,
    }).where(eq(notes.id, noteId));
    throw err;
  }
}
