import { FastifyInstance } from 'fastify';
import { saveUploadedFile, isSupportedFile, ensureUploadDir } from '../services/file-handler.js';

export async function uploadRoutes(app: FastifyInstance) {
  await ensureUploadDir();

  app.post('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const buffer = await data.toBuffer();
    const fileType = data.mimetype;
    const fileName = data.filename;

    if (!isSupportedFile(fileType)) {
      return reply.status(400).send({
        error: `Unsupported file type: ${fileType}. Supported: images, PDF, Word, text files`,
      });
    }

    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(400).send({ error: 'File too large. Max 10MB.' });
    }

    try {
      const result = await saveUploadedFile(userId, fileName, fileType, buffer);
      return {
        fileName: result.fileName,
        fileType: result.fileType,
        fileSize: result.fileSize,
        filePath: result.filePath,
        extractedText: result.extractedText,
      };
    } catch (err) {
      request.log.error({ err }, 'Upload failed');
      return reply.status(500).send({ error: 'Upload failed' });
    }
  });
}
