import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { personas } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  systemPromptTemplate: z.string().min(1),
  teachingStyle: z.record(z.any()).optional(),
  knowledgeDomains: z.array(z.string()).optional(),
  defaultModel: z.string().optional(),
});

export async function personaRoutes(app: FastifyInstance) {
  app.get('/', { onRequest: [app.authenticate] }, async (request) => {
    return db.select().from(personas).where(eq(personas.userId, request.user!.id));
  });

  app.post('/', { onRequest: [app.authenticate] }, async (request) => {
    const body = createSchema.parse(request.body);
    const userId = request.user!.id;

    const [persona] = await db.insert(personas).values({
      userId,
      name: body.name,
      description: body.description || null,
      systemPromptTemplate: body.systemPromptTemplate,
      teachingStyle: body.teachingStyle || null,
      knowledgeDomains: body.knowledgeDomains || null,
      defaultModel: body.defaultModel || null,
    }).returning();

    return persona;
  });

  app.patch('/:id', { onRequest: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = createSchema.partial().parse(request.body);
    const userId = request.user!.id;

    const [persona] = await db.update(personas)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(personas.id, id), eq(personas.userId, userId)))
      .returning();

    if (!persona) {
      request.server.httpErrors.notFound('Persona not found');
    }
    return persona;
  });

  app.delete('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    await db.delete(personas)
      .where(and(eq(personas.id, id), eq(personas.userId, userId)));

    return reply.send({ message: 'Deleted' });
  });
}
