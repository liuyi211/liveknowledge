import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

export default fp(async (fastify: FastifyInstance) => {
  fastify.addHook('onRequest', async (request) => {
    request.log = request.log.child({
      requestId: request.id,
      userId: (request as any).session?.userId || 'anonymous',
    });
    request.log.debug({ method: request.method, url: request.url }, `-> ${request.method} ${request.url}`);
  });

  fastify.addHook('onResponse', async (request, reply) => {
    request.log.debug(
      { statusCode: reply.statusCode, duration: Math.round(reply.elapsedTime) },
      `<- ${reply.statusCode} (${Math.round(reply.elapsedTime)}ms)`
    );
  });
});
