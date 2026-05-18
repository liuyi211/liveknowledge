import { FastifyInstance } from 'fastify';
import { extractTextFromFile, fileToBase64, isSupportedFile, isImageFile } from '../services/file-handler.js';
import { z } from 'zod';

const urlSchema = z.object({
  url: z.string().url(),
});

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return htmlToText(match?.[1] || '').slice(0, 120) || fallback;
}

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
          mode: 'vision',
        };
      }

      const extractedText = await extractTextFromFile(fileType, buffer);
      if (!extractedText) {
        return reply.status(422).send({
          error: `无法从 "${fileName}" 提取文本，请换成可复制文本的 PDF/Word/文本文件，或以图片方式上传给支持 vision 的模型。`,
        });
      }

      return {
        fileName,
        fileType,
        extractedText,
        mode: 'text',
        extractedTextLength: extractedText.length,
        warning: extractedText.length >= 10000 ? '文本已截断到前 10000 字符' : undefined,
      };
    } catch (err) {
      request.log.error({ err }, 'Upload processing failed');
      return reply.status(500).send({ error: 'Upload processing failed' });
    }
  });

  app.post('/url', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { url } = urlSchema.parse(request.body);
    const parsedUrl = new URL(url);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return reply.status(400).send({ error: 'Only http(s) URLs are supported' });
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'LiveKnowledge/0.1',
          Accept: 'text/html,text/plain,application/xhtml+xml',
        },
      });

      if (!response.ok) {
        return reply.status(400).send({ error: `URL fetch failed: HTTP ${response.status}` });
      }

      const contentType = response.headers.get('content-type') || 'text/plain';
      const raw = (await response.text()).slice(0, 300000);
      const extractedText = contentType.includes('html') ? htmlToText(raw) : raw.trim();

      if (!extractedText) {
        return reply.status(422).send({ error: 'No readable text found at this URL' });
      }

      const title = contentType.includes('html') ? extractTitle(raw, parsedUrl.hostname) : parsedUrl.hostname;
      const clipped = extractedText.slice(0, 10000);

      return {
        fileName: title,
        fileType: 'text/url',
        extractedText: `[URL] ${url}\n\n${clipped}`,
        mode: 'text',
        extractedTextLength: clipped.length,
        warning: extractedText.length > clipped.length ? '网页正文已截断到前 10000 字符' : undefined,
      };
    } catch (err) {
      request.log.error({ err, url }, 'URL processing failed');
      return reply.status(500).send({ error: 'URL processing failed' });
    }
  });
}
