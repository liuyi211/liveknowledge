import { FastifyInstance } from 'fastify';
import { extractTextFromFile, fileToBase64, isSupportedFile, isImageFile } from '../services/file-handler.js';

export async function uploadRoutes(app: FastifyInstance) {
  app.post('/', { onRequest: [app.authenticate] }, async (request, reply) => {
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
      if (isImageFile(fileType)) {
        return {
          fileName,
          fileType,
          base64: fileToBase64(buffer, fileType),
        };
      }

      const extractedText = await extractTextFromFile(fileType, buffer);
      return {
        fileName,
        fileType,
        extractedText,
      };
    } catch (err) {
      request.log.error({ err }, 'Upload processing failed');
      return reply.status(500).send({ error: 'Upload processing failed' });
    }
  });
}
