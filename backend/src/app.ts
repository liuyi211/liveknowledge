import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import dotenv from 'dotenv';
import requestTrace from './plugins/request-trace.js';
import authPlugin from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';

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
  await app.register(session, {
    secret: process.env.SESSION_SECRET || 'default-secret-change-me',
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 86400000,
    },
  });

  await app.register(requestTrace);
  await app.register(authPlugin);

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(authRoutes, { prefix: '/api/auth' });

  return app;
}
