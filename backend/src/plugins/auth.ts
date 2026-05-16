import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

declare module 'fastify' {
  interface Session {
    userId?: string;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request, reply) => {
    if (!request.session.userId) {
      reply.status(401);
      throw new Error('Unauthorized');
    }
    const [user] = await db.select().from(users).where(eq(users.id, request.session.userId)).limit(1);
    if (!user) {
      request.session.destroy();
      reply.status(401);
      throw new Error('User not found');
    }
    request.user = user;
  });
};

export default fp(authPlugin);
