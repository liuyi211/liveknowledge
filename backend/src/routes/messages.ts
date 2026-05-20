import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as messageService from '../services/message-service.js';
import { handleStreamChat } from '../services/chat-service.js';

const sendSchema = z.object({
  content: z.string().min(1),
  action: z.enum(['send', 'editAndResend', 'regenerate']).optional().default('send'),
  messageId: z.string().optional(),
  modelId: z.string().optional(),
  attachments: z.array(z.object({
    fileName: z.string(),
    fileType: z.string(),
    extractedText: z.string().optional(),
    base64: z.string().optional(),
  })).optional().default([]),
});

const feedbackSchema = z.object({
  feedback: z.enum(['like', 'dislike']),
});

export async function messageRoutes(app: FastifyInstance) {
  app.options('/session/:sessionId/stream', async (_request, reply) => {
    reply
      .header('Access-Control-Allow-Origin', 'http://localhost:3000')
      .header('Access-Control-Allow-Credentials', 'true')
      .header('Access-Control-Allow-Headers', 'Content-Type')
      .header('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .status(204)
      .send();
  });

  app.get('/session/:sessionId', { onRequest: [app.authenticate] }, async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const limit = z.coerce.number().optional().parse((request.query as any)?.limit) || undefined;
    const offset = z.coerce.number().optional().parse((request.query as any)?.offset) || undefined;
    return messageService.listMessages(sessionId, { limit, offset });
  });

  app.post('/session/:sessionId/stream', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = sendSchema.parse(request.body);
    const userId = request.user!.id;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Access-Control-Allow-Credentials': 'true',
    });
    reply.raw.flushHeaders?.();
    reply.raw.socket?.setNoDelay(true);

    const abortController = new AbortController();
    const writeEvent = (payload: unknown) => {
      if (reply.raw.writableEnded || reply.raw.destroyed) return;
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      (reply.raw as any).flush?.();
    };

    writeEvent({ type: 'ping' });
    const heartbeat = setInterval(() => {
      writeEvent({ type: 'ping' });
    }, 10000);

    try {
      for await (const chunk of handleStreamChat(userId, sessionId, body, request.log, abortController.signal)) {
        writeEvent(chunk);
      }
    } catch (err) {
      writeEvent({ type: 'error', error: (err as Error).message });
    } finally {
      clearInterval(heartbeat);
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.end();
      }
    }
  });

  app.patch('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ content: z.string().min(1) }).parse(request.body);

    const message = await messageService.updateMessageContent(id, body.content);
    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }
    return message;
  });

  app.delete('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const message = await messageService.softDeleteMessage(id);
    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }
    return reply.send({ message: 'Deleted' });
  });

  app.post('/:id/feedback', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = feedbackSchema.parse(request.body);

    const message = await messageService.addFeedback(id, body.feedback);
    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }
    return message;
  });
}
