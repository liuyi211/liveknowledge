import { db } from '../db/index.js';
import { notes } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { splitDocument } from './chunking.js';
import { storeNoteEmbeddings, deleteNoteEmbeddings } from './embedding.js';

export async function indexNote(noteId: string, userId: string): Promise<void> {
  const startTime = Date.now();
  const logs: any[] = [];

  try {
    const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
    if (!note) throw new Error('Note not found');

    // Step 1: Chunking
    await db.update(notes).set({ indexStatus: 'chunking' }).where(eq(notes.id, noteId));
    const chunkStart = Date.now();
    const chunks = splitDocument(note.content, noteId);
    logs.push({
      step: 'chunk',
      status: 'completed',
      timestamp: new Date(),
      detail: { chunk_count: chunks.length, total_chars: note.content.length },
      duration_ms: Date.now() - chunkStart,
    });

    // Step 2: Delete old embeddings
    await deleteNoteEmbeddings(noteId);

    // Step 3: Embedding
    await db.update(notes).set({ indexStatus: 'embedding', indexLogs: logs }).where(eq(notes.id, noteId));
    const embedStart = Date.now();
    await storeNoteEmbeddings(
      chunks.map(c => ({ content: c.content, metadata: c.metadata })),
      userId,
      noteId
    );
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

  } catch (error) {
    const err = error as Error;
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
