import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const registerSchema = z.object({
  username: z.string().min(3).max(100),
  password: z.string().min(6),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(body.password, 10);

    try {
      const [user] = await db.insert(users).values({
        username: body.username,
        passwordHash,
      }).returning();

      request.session.userId = user.id;
      return { id: user.id, username: user.username };
    } catch (err) {
      reply.status(409);
      throw new Error('Username already exists');
    }
  });

  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const [user] = await db.select().from(users).where(eq(users.username, body.username)).limit(1);
    if (!user || !await bcrypt.compare(body.password, user.passwordHash)) {
      reply.status(401);
      throw new Error('Invalid credentials');
    }

    request.session.userId = user.id;
    return { id: user.id, username: user.username };
  });

  app.post('/logout', async (request, reply) => {
    request.session.destroy();
    return { message: 'Logged out' };
  });

  app.get('/me', { onRequest: [app.authenticate] }, async (request) => {
    return { id: request.user!.id, username: request.user!.username };
  });
}
