import fp from 'fastify-plugin';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const DEV_USERNAME = 'dev';
const DEV_PASSWORD = 'dev123';

/**
 * 开发环境自动登录插件。
 * 开发模式下自动创建测试用户并写入 session。
 * 设置 DEV_AUTO_LOGIN=false 可关闭。
 */
export default fp(async (fastify) => {
  const enabled = process.env.DEV_AUTO_LOGIN !== 'false';
  if (process.env.NODE_ENV === 'production' || !enabled) {
    fastify.log.debug('开发自动登录：已关闭');
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
      fastify.log.debug({ userId: user.id }, '开发自动登录：已创建测试用户');
    }

    // Auto-login
    request.session.userId = user.id;
    fastify.log.debug({ userId: user.id }, '开发自动登录：已自动认证');
  });
});
