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
import { retrievalSettingsRoutes } from './routes/retrieval-settings.js';
import { extractionRoutes } from './routes/extraction.js';
import { reviewRoutes } from './routes/review.js';
import { graphRoutes } from './routes/graph.js';
import { profileRoutes } from './routes/profile.js';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { ensureBuiltinPersonasForUser } from './services/persona-service.js';

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
    disableRequestLogging: true,
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
  await app.register(retrievalSettingsRoutes, { prefix: '/api/retrieval' });
  await app.register(extractionRoutes, { prefix: '/api/extraction' });
  await app.register(reviewRoutes, { prefix: '/api/review' });
  await app.register(graphRoutes, { prefix: '/api/graph' });
  await app.register(profileRoutes, { prefix: '/api/profile' });

  // Seed default personas for existing users on startup
  app.addHook('onReady', async () => {
    const allUsers = await db.select().from(users);
    for (const user of allUsers) {
      await ensureBuiltinPersonasForUser(user.id);
      app.log.info({ userId: user.id }, 'Initialized built-in personas for user');
    }
  });

  return app;
}
