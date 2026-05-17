import fp from 'fastify-plugin';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const DEV_USERNAME = 'dev';
const DEV_PASSWORD = 'dev123';

/**
 * Development auto-login plugin.
 * In development mode, automatically creates a test user and sets session.
 * Set DEV_AUTO_LOGIN=false to disable.
 */
export default fp(async (fastify) => {
  const enabled = process.env.DEV_AUTO_LOGIN !== 'false';
  if (process.env.NODE_ENV === 'production' || !enabled) {
    fastify.log.info('Dev auto-login: disabled');
    return;
  }

  fastify.addHook('onRequest', async (request) => {
    // Skip if already authenticated
    if (request.session?.userId) {
      return;
    }

    // Skip auth routes (allow normal login/register flow)
    if (request.url.startsWith('/api/auth/')) {
      return;
    }

    // Find or create dev user
    let [user] = await db.select().from(users).where(eq(users.username, DEV_USERNAME)).limit(1);

    if (!user) {
      const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
      [user] = await db.insert(users).values({
        username: DEV_USERNAME,
        passwordHash,
      }).returning();
      fastify.log.info({ userId: user.id }, 'Dev auto-login: created test user');
    }

    // Auto-login
    request.session.userId = user.id;
    fastify.log.debug({ userId: user.id }, 'Dev auto-login: auto-authenticated');
  });
});
