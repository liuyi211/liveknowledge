import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { notes } from '../db/schema.js';
import { eq, and, desc, or, ilike, isNull } from 'drizzle-orm';
import { z } from 'zod';

const noteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().default(''),
  tags: z.array(z.string()).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

const listQuerySchema = z.object({
  folderId: z.string().optional(),
  q: z.string().optional(),
});

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
    const [note] = await db.insert(notes).values({
      userId: request.user!.id,
      title: body.title,
      content: body.content,
      tags: body.tags || null,
      folderId: body.folderId ?? null,
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

    const [note] = await db.update(notes)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(notes.id, id), eq(notes.userId, request.user!.id)))
      .returning();

    return note;
  });

  app.delete('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, request.user!.id)));
    return reply.send({ message: 'Deleted' });
  });
}
