import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { personas } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import {
  buildPersonaPrompt,
  cleanupObsoleteBuiltinPersonasForUser,
  generatePersonaFromDescription,
  teachingStyleFromConfig,
  type LightweightPersonaConfig,
} from '../services/persona-service.js';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  systemPromptTemplate: z.string().optional(),
  teachingStyle: z.record(z.any()).optional(),
  knowledgeDomains: z.array(z.string()).optional(),
  defaultModel: z.string().optional(),
  responseStyle: z.array(z.string()).optional(),
  questionStyle: z.array(z.string()).optional(),
  reminders: z.array(z.string()).optional(),
  tone: z.array(z.string()).optional(),
});

const generateSchema = z.object({
  description: z.string().min(10).max(2000),
});

export async function personaRoutes(app: FastifyInstance) {
  app.get('/', { onRequest: [app.authenticate] }, async (request) => {
    await cleanupObsoleteBuiltinPersonasForUser(request.user!.id);
    return db.select().from(personas).where(eq(personas.userId, request.user!.id));
  });

  app.post('/', { onRequest: [app.authenticate] }, async (request) => {
    const body = createSchema.parse(request.body);
    const userId = request.user!.id;
    const config: LightweightPersonaConfig = {
      domains: body.knowledgeDomains || [],
      responseStyle: body.responseStyle || [],
      questionStyle: body.questionStyle || [],
      reminders: body.reminders || [],
      tone: body.tone || [],
    };
    const systemPromptTemplate = body.systemPromptTemplate
      || buildPersonaPrompt(body.name, body.description, config);

    const [persona] = await db.insert(personas).values({
      userId,
      name: body.name,
      description: body.description || null,
      systemPromptTemplate,
      teachingStyle: body.teachingStyle || teachingStyleFromConfig(config),
      knowledgeDomains: body.knowledgeDomains || null,
      defaultModel: body.defaultModel || null,
    }).returning();

    return persona;
  });

  app.post('/generate', { onRequest: [app.authenticate] }, async (request) => {
    const body = generateSchema.parse(request.body);
    const generated = await generatePersonaFromDescription(request.user!.id, body.description, request.log);

    const [persona] = await db.insert(personas).values({
      userId: request.user!.id,
      name: generated.name,
      description: generated.description,
      systemPromptTemplate: generated.systemPromptTemplate,
      teachingStyle: generated.teachingStyle,
      knowledgeDomains: generated.knowledgeDomains,
      defaultModel: null,
      isBuiltin: false,
    }).returning();

    return persona;
  });

  app.patch('/:id', { onRequest: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = createSchema.partial().parse(request.body);
    const userId = request.user!.id;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description || null;
    if (body.defaultModel !== undefined) updateData.defaultModel = body.defaultModel || null;
    if (body.knowledgeDomains !== undefined) updateData.knowledgeDomains = body.knowledgeDomains;
    if (body.teachingStyle !== undefined) updateData.teachingStyle = body.teachingStyle;
    if (body.systemPromptTemplate !== undefined) updateData.systemPromptTemplate = body.systemPromptTemplate;

    const [persona] = await db.update(personas)
      .set(updateData)
      .where(and(eq(personas.id, id), eq(personas.userId, userId)))
      .returning();

    if (!persona) {
      throw new Error('Persona not found');
    }
    return persona;
  });

  app.delete('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    await db.delete(personas)
      .where(and(eq(personas.id, id), eq(personas.userId, userId), eq(personas.isBuiltin, false)));

    return reply.send({ message: 'Deleted' });
  });
}
