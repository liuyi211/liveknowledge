import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

export default fp(async (fastify: FastifyInstance) => {
  fastify.addHook('onRequest', async (request) => {
    request.log = request.log.child({
      requestId: request.id,
      userId: (request as any).session?.userId || 'anonymous',
    });
    request.log.debug({ method: request.method, url: request.url }, `请求开始：${request.method} ${request.url}`);
  });

  fastify.addHook('onResponse', async (request, reply) => {
    request.log.debug(
      { statusCode: reply.statusCode, duration: Math.round(reply.elapsedTime) },
      `请求完成：${reply.statusCode}（${Math.round(reply.elapsedTime)}ms）`
    );
  });
});
