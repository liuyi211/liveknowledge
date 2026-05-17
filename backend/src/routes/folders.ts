import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { folders } from '../db/schema.js';
import { eq, and, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';

const nameSchema = z.string()
  .min(1, '名称不能为空')
  .max(100, '名称不能超过 100 个字符')
  .refine((v) => !/[\/\\<>:"|?*]/.test(v), '名称包含非法字符');

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

async function getSiblingFolderNames(userId: string, parentId: string | null, excludeId?: string): Promise<Set<string>> {
  const conditions = [eq(folders.userId, userId)];
  if (parentId) {
    conditions.push(eq(folders.parentId, parentId));
  } else {
    conditions.push(isNull(folders.parentId));
  }
  if (excludeId) {
    conditions.push(ne(folders.id, excludeId));
  }
  const rows = await db.select({ name: folders.name })
    .from(folders)
    .where(and(...conditions));
  return new Set(rows.map(r => r.name));
}

const createSchema = z.object({
  name: nameSchema,
  parentId: z.string().uuid().nullable().optional(),
});

const updateSchema = z.object({
  name: nameSchema.optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export async function folderRoutes(app: FastifyInstance) {
  app.get('/', { onRequest: [app.authenticate] }, async (request) => {
    return db.select().from(folders)
      .where(eq(folders.userId, request.user!.id))
      .orderBy(folders.name);
  });

  app.post('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const userId = request.user!.id;
    const parentId = body.parentId ?? null;

    if (body.parentId) {
      const [parent] = await db.select().from(folders)
        .where(and(eq(folders.id, body.parentId), eq(folders.userId, userId)))
        .limit(1);
      if (!parent) {
        return reply.status(400).send({ error: 'Parent folder not found' });
      }
    }

    const siblingNames = await getSiblingFolderNames(userId, parentId);
    const uniqueName = makeUniqueName(body.name, siblingNames);

    const [folder] = await db.insert(folders).values({
      userId,
      name: uniqueName,
      parentId,
    }).returning();
    return folder;
  });

  app.patch('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateSchema.parse(request.body);
    const userId = request.user!.id;

    if (body.parentId === id) {
      return reply.status(400).send({ error: 'Folder cannot be its own parent' });
    }

    if (body.parentId) {
      const descendants = await collectDescendantIds(userId, id);
      if (descendants.has(body.parentId)) {
        return reply.status(400).send({ error: 'Cannot move folder into its own descendant' });
      }
    }

    if (body.name) {
      let parentId: string | null = null;
      if ('parentId' in body) {
        parentId = body.parentId ?? null;
      } else {
        const [existing] = await db.select({ parentId: folders.parentId })
          .from(folders)
          .where(and(eq(folders.id, id), eq(folders.userId, userId)))
          .limit(1);
        if (existing) {
          parentId = existing.parentId;
        }
      }
      const siblingNames = await getSiblingFolderNames(userId, parentId, id);
      body.name = makeUniqueName(body.name, siblingNames);
    }

    const [folder] = await db.update(folders)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(folders.id, id), eq(folders.userId, userId)))
      .returning();

    if (!folder) {
      return reply.status(404).send({ error: 'Folder not found' });
    }
    return folder;
  });

  app.delete('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    const [folder] = await db.select().from(folders)
      .where(and(eq(folders.id, id), eq(folders.userId, userId)))
      .limit(1);

    if (!folder) {
      return reply.status(404).send({ error: 'Folder not found' });
    }

    await db.delete(folders).where(and(eq(folders.id, id), eq(folders.userId, userId)));
    return reply.send({ message: 'Deleted' });
  });
}

async function collectDescendantIds(userId: string, rootId: string): Promise<Set<string>> {
  const all = await db.select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(eq(folders.userId, userId));

  const childrenOf = new Map<string, string[]>();
  for (const f of all) {
    const key = f.parentId ?? '__root__';
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(f.id);
  }

  const result = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const kids = childrenOf.get(current) || [];
    for (const kid of kids) {
      if (!result.has(kid)) {
        result.add(kid);
        queue.push(kid);
      }
    }
  }
  return result;
}
