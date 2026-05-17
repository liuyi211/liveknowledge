import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { notes } from '../db/schema.js';
import { eq, and, desc, or, ilike, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';

const titleSchema = z.string()
  .min(1, '标题不能为空')
  .max(100, '标题不能超过 100 个字符')
  .refine((v) => !/[\/\\<>:"|?*]/.test(v), '标题包含非法字符');

const noteSchema = z.object({
  title: titleSchema,
  content: z.string().default(''),
  tags: z.array(z.string()).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

const listQuerySchema = z.object({
  folderId: z.string().optional(),
  q: z.string().optional(),
});

function makeUniqueName(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) return name;
  let candidate = `${name} copy`;
  if (!existingNames.has(candidate)) return candidate;
  let i = 2;
  while (true) {
    candidate = `${name} copy ${i}`;
    if (!existingNames.has(candidate)) return candidate;
    i++;
  }
}

async function getSiblingNoteTitles(userId: string, folderId: string | null, excludeId?: string): Promise<Set<string>> {
  const conditions = [eq(notes.userId, userId)];
  if (folderId) {
    conditions.push(eq(notes.folderId, folderId));
  } else {
    conditions.push(isNull(notes.folderId));
  }
  if (excludeId) {
    conditions.push(ne(notes.id, excludeId));
  }
  const rows = await db.select({ title: notes.title })
    .from(notes)
    .where(and(...conditions));
  return new Set(rows.map(r => r.title));
}

export async function noteRoutes(app: FastifyInstance) {
  app.get('/', { onRequest: [app.authenticate] }, async (request) => {
    const { folderId, q } = listQuerySchema.parse(request.query ?? {});
    const userId = request.user!.id;

    const conditions = [eq(notes.userId, userId)];

    if (q && q.trim()) {
      const pattern = `%${q.trim()}%`;
      conditions.push(or(ilike(notes.title, pattern), ilike(notes.content, pattern))!);
    } else if (folderId !== undefined) {
      if (folderId === '' || folderId === 'null' || folderId === 'root') {
        conditions.push(isNull(notes.folderId));
      } else {
        conditions.push(eq(notes.folderId, folderId));
      }
    }

    return db.select().from(notes)
      .where(and(...conditions))
      .orderBy(desc(notes.updatedAt));
  });

  app.post('/', { onRequest: [app.authenticate] }, async (request) => {
    const body = noteSchema.parse(request.body);
    const userId = request.user!.id;
    const folderId = body.folderId ?? null;

    const siblingTitles = await getSiblingNoteTitles(userId, folderId);
    const uniqueTitle = makeUniqueName(body.title, siblingTitles);

    const [note] = await db.insert(notes).values({
      userId,
      title: uniqueTitle,
      content: body.content,
      tags: body.tags || null,
      folderId,
    }).returning();
    return note;
  });

  app.get('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [note] = await db.select().from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, request.user!.id)))
      .limit(1);

    if (!note) {
      return reply.status(404).send({ error: 'Note not found' });
    }
    return note;
  });

  app.patch('/:id', { onRequest: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = noteSchema.partial().parse(request.body);
    const userId = request.user!.id;

    if (body.title) {
      let folderId: string | null = null;
      if ('folderId' in body) {
        folderId = body.folderId ?? null;
      } else {
        const [existing] = await db.select({ folderId: notes.folderId })
          .from(notes)
          .where(and(eq(notes.id, id), eq(notes.userId, userId)))
          .limit(1);
        if (existing) {
          folderId = existing.folderId;
        }
      }
      const siblingTitles = await getSiblingNoteTitles(userId, folderId, id);
      body.title = makeUniqueName(body.title, siblingTitles);
    }

    const [note] = await db.update(notes)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .returning();

    return note;
  });

  app.delete('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, request.user!.id)));
    return reply.send({ message: 'Deleted' });
  });

  // Index endpoints
  app.post('/:id/index', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    const [note] = await db.select().from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .limit(1);

    if (!note) {
      return reply.status(404).send({ error: 'Note not found' });
    }

    await db.update(notes)
      .set({ indexStatus: 'chunking', indexLogs: [], indexError: null })
      .where(eq(notes.id, id));

    // Trigger async indexing
    const { indexNote } = await import('../services/indexing.js');
    indexNote(id, userId).catch(err => {
      console.error('Indexing failed:', err);
      db.update(notes)
        .set({ indexStatus: 'failed', indexError: err.message })
        .where(eq(notes.id, id));
    });

    return { status: 'started' };
  });

  app.get('/:id/index-status', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    const [note] = await db.select({
      indexStatus: notes.indexStatus,
      indexLogs: notes.indexLogs,
      indexError: notes.indexError,
      indexedAt: notes.indexedAt,
    }).from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .limit(1);

    if (!note) {
      return reply.status(404).send({ error: 'Note not found' });
    }

    return note;
  });
}
