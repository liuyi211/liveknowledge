import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import requestTrace from './plugins/request-trace.js';
import authPlugin from './plugins/auth.js';
import devAutoLogin from './plugins/dev-auto-login.js';
import { authRoutes } from './routes/auth.js';
import { personaRoutes } from './routes/personas.js';
import { providerRoutes } from './routes/providers.js';
import { sessionRoutes } from './routes/sessions.js';
import { messageRoutes } from './routes/messages.js';
import { uploadRoutes } from './routes/uploads.js';
import { noteRoutes } from './routes/notes.js';
import { folderRoutes } from './routes/folders.js';
import { db } from './db/index.js';
import { users, personas } from './db/schema.js';
import { eq } from 'drizzle-orm';

dotenv.config();

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user?: { id: string; username: string; passwordHash: string; createdAt: Date; updatedAt: Date };
  }
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'debug',
      transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: true,
        },
      } : undefined,
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'apiKey', 'apiKeyEncrypted'],
        remove: true,
      },
    },
  });

  await app.register(cors, {
    origin: 'http://localhost:3000',
    credentials: true,
  });

  await app.register(cookie);

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET environment variable is required and must be at least 32 characters long');
  }

  await app.register(session, {
    secret: sessionSecret,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 86400000,
      sameSite: 'lax',
    },
  });

  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  await app.register(requestTrace);
  await app.register(authPlugin);
  await app.register(devAutoLogin);

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(personaRoutes, { prefix: '/api/personas' });
  await app.register(providerRoutes, { prefix: '/api/providers' });
  await app.register(sessionRoutes, { prefix: '/api/sessions' });
  await app.register(messageRoutes, { prefix: '/api/messages' });
  await app.register(uploadRoutes, { prefix: '/api/upload' });
  await app.register(noteRoutes, { prefix: '/api/notes' });
  await app.register(folderRoutes, { prefix: '/api/folders' });

  // Seed default personas for existing users on startup
  app.addHook('onReady', async () => {
    const allUsers = await db.select().from(users);
    for (const user of allUsers) {
      const existing = await db.select().from(personas).where(eq(personas.userId, user.id)).limit(1);
      if (existing.length > 0) continue;

      await db.insert(personas).values([
        {
          userId: user.id,
          name: '通用助手',
          description: '全能型学习助手，善于解释各类知识',
          systemPromptTemplate: '你是一位博学多才的学习助手。请用清晰易懂的方式回答用户的问题。如果涉及复杂概念，请先给出直观理解，再补充细节。',
          isBuiltin: true,
          defaultModel: 'gpt-4o-mini',
        },
        {
          userId: user.id,
          name: '算法导师',
          description: '专注算法与数据结构，擅长逐步推导',
          systemPromptTemplate: '你是一位算法导师。讲解算法时请：1) 先说明问题背景和应用场景；2) 给出直观理解（如类比、图示描述）；3) 逐步推导算法逻辑；4) 分析时间/空间复杂度；5) 给出代码示例。',
          isBuiltin: true,
          defaultModel: 'gpt-4o-mini',
        },
      ]);
      app.log.info({ userId: user.id }, 'Seeded default personas for user');
    }
  });

  return app;
}
