import { db } from '../db/index.js';
import { messages } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { streamChat, chat, supportsVision, type ChatMessage } from './ai-provider.js';
import { retrieveContext } from './retrieval/index.js';
import * as sessionService from './session-service.js';
import * as messageService from './message-service.js';
import { isImageFile } from './file-handler.js';
import type { FastifyBaseLogger } from 'fastify';
import type { SendMessageBody } from '../types/chat.js';

export async function buildSystemPrompt(
  userId: string,
  sessionId: string,
  query: string,
  attachmentTexts: string[],
  log: FastifyBaseLogger
): Promise<string> {
  let systemPrompt = 'You are a helpful assistant.';

  const session = await sessionService.getSessionById(sessionId, userId);
  if (session?.personaId) {
    const persona = await sessionService.getPersonaForSession(session.personaId, userId);
    if (persona) {
      systemPrompt = persona.systemPromptTemplate;
    }
  }

  // RAG retrieval
  const contextStr = await retrieveContext(query, userId);

  if (contextStr) {
    systemPrompt += `\n\n${contextStr}`;
  }

  // Attachment context
  if (attachmentTexts.length > 0) {
    systemPrompt += `\n\n用户上传了以下文件内容，请在回答时参考：\n\n${attachmentTexts.join('\n---\n')}`;
  }

  return systemPrompt;
}

export async function buildChatMessages(
  sessionId: string,
  systemPrompt: string,
  userContent: string,
  imageAttachments?: Array<{ fileType: string; base64: string }>
): Promise<ChatMessage[]> {
  const recentMessages = await db.select().from(messages)
    .where(and(
      eq(messages.sessionId, sessionId),
      eq(messages.isDeleted, false)
    ))
    .orderBy(messages.createdAt)
    .limit(20);

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add recent history
  for (const m of recentMessages) {
    chatMessages.push({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    });
  }

  // Build user message with images
  if (imageAttachments && imageAttachments.length > 0) {
    const contentParts: ChatMessage['content'] = [
      { type: 'text', text: userContent },
    ];

    for (const img of imageAttachments) {
      if (isImageFile(img.fileType) && img.base64) {
        contentParts.push({
          type: 'image_url',
          image_url: { url: img.base64 },
        });
      }
    }

    chatMessages.push({ role: 'user', content: contentParts });
  } else {
    chatMessages.push({ role: 'user', content: userContent });
  }

  return chatMessages;
}

export async function* handleStreamChat(
  userId: string,
  sessionId: string,
  body: SendMessageBody,
  log: FastifyBaseLogger,
  abortSignal?: AbortSignal
): AsyncGenerator<
  | { type: 'chunk'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; error: string },
  void,
  unknown
> {
  const { content, action = 'send', messageId, modelId: overrideModelId, attachments = [] } = body;

  try {
    const session = await sessionService.getSessionById(sessionId, userId);
    if (!session) {
      yield { type: 'error', error: 'Session not found' };
      return;
    }

    // Determine model
    let model = overrideModelId || session.modelId;
    let providerType: string | undefined;
    if (!model) {
      const defaultConfig = await import('./ai-provider.js').then(m => m.getDefaultChatModel(userId));
      model = defaultConfig.model;
      providerType = defaultConfig.providerType;
    }

    // Handle different actions
    let userMessageId: string;
    let textAttachments: string[] = [];
    let imageAttachments: Array<{ fileType: string; base64: string }> = [];

    // Separate image and text attachments
    for (const att of attachments) {
      if (isImageFile(att.fileType)) {
        imageAttachments.push(att as any);
      } else if (att.extractedText) {
        textAttachments.push(`[${att.fileName}]\n${att.extractedText}`);
      }
    }

    if (action === 'send') {
      const msg = await messageService.createUserMessage(sessionId, content);
      userMessageId = msg.id;

      // Save attachments for user message
      for (const att of attachments) {
        if (att.extractedText || att.base64) {
          await messageService.createAttachment(
            userMessageId,
            att.fileName,
            att.fileType,
            att.extractedText,
            att.base64
          );
        }
      }
    } else if (action === 'editAndResend') {
      if (!messageId) {
        yield { type: 'error', error: 'messageId required for editAndResend' };
        return;
      }
      const originalMsg = await messageService.getMessageById(messageId);
      if (!originalMsg) {
        yield { type: 'error', error: 'Message not found' };
        return;
      }

      // Soft delete original
      await messageService.softDeleteMessage(messageId);
      // Delete associated assistant messages
      await messageService.deleteAssistantMessagesAfter(sessionId, messageId);

      // Create new version
      const newMsg = await messageService.createUserMessage(sessionId, content, {
        parentId: originalMsg.parentId || messageId,
        version: originalMsg.version + 1,
      });
      userMessageId = newMsg.id;
    } else if (action === 'regenerate') {
      if (!messageId) {
        yield { type: 'error', error: 'messageId required for regenerate' };
        return;
      }
      // Soft delete the assistant message
      await messageService.softDeleteMessage(messageId);

      // Find the last user message
      const lastUserMsg = await messageService.getLatestUserMessage(sessionId);
      if (!lastUserMsg) {
        yield { type: 'error', error: 'No user message to regenerate from' };
        return;
      }
      userMessageId = lastUserMsg.id;
    } else {
      yield { type: 'error', error: 'Unknown action' };
      return;
    }

    // Build prompt and messages
    const systemPrompt = await buildSystemPrompt(userId, sessionId, content, textAttachments, log);

    // Get image base64 from attachments for vision models
    const imageFiles = imageAttachments.map(a => ({ fileType: a.fileType, base64: (a as any).base64 || '' }));

    const chatMessages = await buildChatMessages(
      sessionId,
      systemPrompt,
      action === 'regenerate' ? (await messageService.getLatestUserMessage(sessionId))?.content || content : content,
      imageFiles
    );

    // Check if model supports vision
    const hasImages = imageFiles.length > 0;
    if (hasImages && !supportsVision(model)) {
      yield { type: 'error', error: `模型 ${model} 不支持图片输入，请切换到支持视觉的模型` };
      return;
    }

    // Stream response
    let fullContent = '';
    let thinkingContent = '';

    for await (const chunk of streamChat(userId, { model, messages: chatMessages, providerType }, log, abortSignal)) {
      if (chunk.type === 'thinking') {
        thinkingContent += chunk.content;
        yield { type: 'thinking', content: chunk.content };
      } else {
        fullContent += chunk.content;
        yield { type: 'chunk', content: chunk.content };
      }
    }

    // Save assistant message
    const assistantMsg = await messageService.createAssistantMessage(sessionId, fullContent, {
      modelId: model,
      thinkingContent: thinkingContent || undefined,
    });

    // Update session stats
    await sessionService.updateSessionStats(sessionId);

    yield { type: 'done', messageId: assistantMsg.id };
  } catch (err) {
    log.error({ err }, 'Chat stream error');
    yield { type: 'error', error: (err as Error).message };
  }
}
