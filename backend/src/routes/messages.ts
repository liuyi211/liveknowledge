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
    filePath: z.string().optional(),
  })).optional().default([]),
});

const feedbackSchema = z.object({
  feedback: z.enum(['like', 'dislike']),
});

export async function messageRoutes(app: FastifyInstance) {
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
    });

    const abortController = new AbortController();

    reply.raw.on('close', () => {
      abortController.abort();
    });

    try {
      for await (const chunk of handleStreamChat(userId, sessionId, body, request.log, abortController.signal)) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: (err as Error).message })}\n\n`);
    } finally {
      reply.raw.end();
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
