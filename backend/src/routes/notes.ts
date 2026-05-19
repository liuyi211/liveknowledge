import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { notes } from '../db/schema.js';
import { eq, and, desc, or, ilike, isNull, ne, sql } from 'drizzle-orm';
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
  sourceType: z.string().max(50).nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  sourceMetadata: z.record(z.unknown()).nullable().optional(),
  version: z.number().int().positive().optional(),
});

const listQuerySchema = z.object({
  folderId: z.string().optional(),
  q: z.string().optional(),
  tag: z.string().optional(),
});

function cleanTags(tags?: string[] | null): string[] | null {
  if (!tags) return null;
  const cleaned = Array.from(new Set(tags.map(tag => tag.trim()).filter(Boolean)));
  return cleaned.length > 0 ? cleaned : null;
}

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
    const { folderId, q, tag } = listQuerySchema.parse(request.query ?? {});
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

    if (tag && tag.trim()) {
      conditions.push(sql`${tag.trim()} = ANY(${notes.tags})`);
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
      tags: cleanTags(body.tags),
      folderId,
      sourceType: body.sourceType ?? null,
      sourceId: body.sourceId ?? null,
      sourceMetadata: body.sourceMetadata ?? null,
    }).returning();
    return note;
  });

  app.get('/meta/tags', { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const rows = await db.execute(sql`
      SELECT tag, count(*)::int AS count
      FROM notes, unnest(coalesce(tags, ARRAY[]::text[])) AS tag
      WHERE user_id = ${userId}
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `);

    return ((rows as any).rows || rows).map((row: any) => ({
      tag: row.tag,
      count: Number(row.count),
    }));
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

  app.patch('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = noteSchema.partial().parse(request.body);
    const userId = request.user!.id;

    const [current] = await db.select().from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .limit(1);

    if (!current) {
      return reply.status(404).send({ error: 'Note not found' });
    }

    if (body.version !== undefined && body.version !== current.version) {
      return reply.status(409).send({
        error: 'NOTE_VERSION_CONFLICT',
        message: '笔记已被其他操作更新，请刷新后再保存。',
        current,
      });
    }

    if (body.title) {
      let folderId: string | null = null;
      if ('folderId' in body) {
        folderId = body.folderId ?? null;
      } else {
        folderId = current.folderId;
      }
      const siblingTitles = await getSiblingNoteTitles(userId, folderId, id);
      body.title = makeUniqueName(body.title, siblingTitles);
    }

    const { version: _version, tags, ...patchBody } = body;
    const shouldBumpVersion = 'title' in patchBody || 'content' in patchBody || tags !== undefined;

    const [note] = await db.update(notes)
      .set({
        ...patchBody,
        ...(tags !== undefined ? { tags: cleanTags(tags) } : {}),
        ...(shouldBumpVersion ? { version: current.version + 1 } : {}),
        updatedAt: new Date(),
      })
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
    app.log.info({ noteId: id, userId }, '收到笔记索引请求');

    const [note] = await db.select().from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .limit(1);

    if (!note) {
      app.log.warn({ noteId: id }, '索引失败：未找到笔记');
      return reply.status(404).send({ error: 'Note not found' });
    }

    app.log.info({ noteId: id, contentLength: note.content.length }, '开始建立笔记索引');

    await db.update(notes)
      .set({ indexStatus: 'chunking', indexLogs: [], indexError: null })
      .where(eq(notes.id, id));

    // Trigger async indexing
    try {
      const { indexNote } = await import('../services/indexing.js');
      indexNote(id, userId, app.log).catch(err => {
        app.log.error({ err }, '笔记索引任务失败');
        db.update(notes)
          .set({ indexStatus: 'failed', indexError: err.message })
          .where(eq(notes.id, id));
      });
      app.log.info({ noteId: id }, '笔记索引任务已启动');
    } catch (err) {
      app.log.error({ err, noteId: id }, '加载索引服务失败');
      await db.update(notes)
        .set({ indexStatus: 'failed', indexError: (err as Error).message })
        .where(eq(notes.id, id));
      return reply.status(500).send({ error: 'Failed to start indexing' });
    }

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
