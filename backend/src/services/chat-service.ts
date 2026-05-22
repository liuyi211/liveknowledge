import { db } from '../db/index.js';
import { messages } from '../db/schema.js';
import { eq, and, ne } from 'drizzle-orm';
import { streamChat, supportsVision, type ChatMessage } from './ai-provider.js';
import { retrieveContext } from './retrieval/index.js';
import { getProfileSummary } from './profile-service.js';
import * as sessionService from './session-service.js';
import * as messageService from './message-service.js';
import { isImageFile } from './file-handler.js';
import type { FastifyBaseLogger } from 'fastify';
import type { SendMessageBody } from '../types/chat.js';

type StreamResult =
  | { type: 'chunk'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; error: string };

function isAbortError(err: unknown) {
  const error = err as { name?: string; type?: string; message?: string };
  return error.name === 'AbortError'
    || error.name === 'APIUserAbortError'
    || error.type === 'APIUserAbortError'
    || error.message === 'Request was aborted.';
}

export async function buildSystemPrompt(
  userId: string,
  sessionId: string,
  query: string,
  attachmentTexts: string[],
  log: FastifyBaseLogger
): Promise<string> {
  let systemPrompt = '你是通用助手。请用中文自然、清楚地回答用户问题。人格不预设专业角色；本地知识库检索结果优先作为事实依据。';

  const session = await sessionService.getSessionById(sessionId, userId);
  if (session?.personaId) {
    const persona = await sessionService.getPersonaForSession(session.personaId, userId);
    if (persona) {
      systemPrompt = persona.systemPromptTemplate;
    }
  }

  if (session?.contextSummary) {
    systemPrompt += `\n\n当前会话在切换角色时保留的上下文摘要：\n${session.contextSummary}`;
  }

  systemPrompt += '\n\n如果用户重复提出与上一轮相同或高度相似的问题，请结合已有回答换一种组织方式补充新的角度、例子或更简洁的总结，不要机械复述上一轮答案。';

  try {
    const profileSummary = await getProfileSummary(userId);
    if (profileSummary) {
      systemPrompt += `\n\n${profileSummary}\n请只把这份画像用于调整解释方式、节奏和复习建议；不要向用户暴露原始画像字段，除非用户明确询问。`;
    }
  } catch (err) {
    log.warn({ err, userId }, 'Failed to load cognitive profile summary for chat prompt');
  }

  const contextStr = await retrieveContext(query, userId, session?.contextSummary);
  if (contextStr) {
    systemPrompt += `\n\n${contextStr}`;
  }

  if (attachmentTexts.length > 0) {
    systemPrompt += `\n\n用户上传了以下文件内容，请在回答时参考：\n\n${attachmentTexts.join('\n---\n')}`;
  }

  log.debug({ promptLength: systemPrompt.length }, 'Built chat system prompt');
  return systemPrompt;
}

export async function buildChatMessages(
  sessionId: string,
  systemPrompt: string,
  userContent: string,
  imageAttachments?: Array<{ fileType: string; base64: string }>,
  currentUserMessageId?: string
): Promise<ChatMessage[]> {
  const conditions = [
    eq(messages.sessionId, sessionId),
    eq(messages.isDeleted, false),
  ];
  if (currentUserMessageId) {
    conditions.push(ne(messages.id, currentUserMessageId));
  }

  const recentMessages = await db.select().from(messages)
    .where(and(...conditions))
    .orderBy(messages.createdAt)
    .limit(20);

  const chatMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
  for (const message of recentMessages) {
    chatMessages.push({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    });
  }

  if (!imageAttachments?.length) {
    chatMessages.push({ role: 'user', content: userContent });
    return chatMessages;
  }

  const contentParts: ChatMessage['content'] = [{ type: 'text', text: userContent }];
  for (const image of imageAttachments) {
    if (isImageFile(image.fileType) && image.base64) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: image.base64 },
      });
    }
  }
  chatMessages.push({ role: 'user', content: contentParts });
  return chatMessages;
}

export async function* handleStreamChat(
  userId: string,
  sessionId: string,
  body: SendMessageBody,
  log: FastifyBaseLogger,
  abortSignal?: AbortSignal
): AsyncGenerator<StreamResult, void, unknown> {
  const { content, action = 'send', messageId, modelId: overrideModelId, attachments = [] } = body;
  let userMessageId: string | undefined;

  try {
    const session = await sessionService.getSessionById(sessionId, userId);
    if (!session) {
      yield { type: 'error', error: 'Session not found' };
      return;
    }

    let model = overrideModelId || session.modelId;
    let providerType: string | undefined;
    if (!model) {
      const defaultConfig = await import('./ai-provider.js').then((module) => module.getDefaultChatModel(userId));
      model = defaultConfig.model;
      providerType = defaultConfig.providerType;
    }

    const textAttachments: string[] = [];
    const imageAttachments: Array<{ fileType: string; base64: string }> = [];
    for (const attachment of attachments) {
      if (isImageFile(attachment.fileType)) {
        imageAttachments.push(attachment as any);
      } else if (attachment.extractedText) {
        textAttachments.push(`[${attachment.fileName}]\n${attachment.extractedText}`);
      }
    }

    if (action === 'send') {
      const message = await messageService.createUserMessage(sessionId, content);
      userMessageId = message.id;

      for (const attachment of attachments) {
        if (attachment.extractedText || attachment.base64) {
          await messageService.createAttachment(
            userMessageId,
            attachment.fileName,
            attachment.fileType,
            attachment.extractedText,
            attachment.base64
          );
        }
      }
    } else if (action === 'editAndResend') {
      if (!messageId) {
        yield { type: 'error', error: 'messageId required for editAndResend' };
        return;
      }

      const originalMessage = await messageService.getMessageById(messageId);
      if (!originalMessage) {
        yield { type: 'error', error: 'Message not found' };
        return;
      }

      await messageService.softDeleteMessage(messageId);
      await messageService.deleteAssistantMessagesAfter(sessionId, messageId);

      const newMessage = await messageService.createUserMessage(sessionId, content, {
        parentId: originalMessage.parentId || messageId,
        version: originalMessage.version + 1,
      });
      userMessageId = newMessage.id;
    } else if (action === 'regenerate') {
      if (!messageId) {
        yield { type: 'error', error: 'messageId required for regenerate' };
        return;
      }

      await messageService.softDeleteMessage(messageId);
      const lastUserMessage = await messageService.getLatestUserMessage(sessionId);
      if (!lastUserMessage) {
        yield { type: 'error', error: 'No user message to regenerate from' };
        return;
      }
      userMessageId = lastUserMessage.id;
    } else {
      yield { type: 'error', error: 'Unknown action' };
      return;
    }

    const effectiveContent = action === 'regenerate'
      ? (await messageService.getLatestUserMessage(sessionId))?.content || content
      : content;

    const systemPrompt = await buildSystemPrompt(userId, sessionId, effectiveContent, textAttachments, log);
    const imageFiles = imageAttachments.map((attachment) => ({
      fileType: attachment.fileType,
      base64: attachment.base64 || '',
    }));

    if (imageFiles.length > 0 && !supportsVision(model)) {
      yield { type: 'error', error: `模型 ${model} 不支持图片输入，请切换到支持视觉的模型` };
      return;
    }

    const chatMessages = await buildChatMessages(
      sessionId,
      systemPrompt,
      effectiveContent,
      imageFiles,
      userMessageId
    );

    let fullContent = '';
    let thinkingContent = '';

    for await (const chunk of streamChat(userId, {
      model,
      messages: chatMessages,
      providerType,
      temperature: 0.9,
    }, log, abortSignal)) {
      if (chunk.type === 'thinking') {
        thinkingContent += chunk.content;
        yield { type: 'thinking', content: chunk.content };
      } else {
        fullContent += chunk.content;
        yield { type: 'chunk', content: chunk.content };
      }
    }

    const finalContent = fullContent.trim()
      ? fullContent
      : abortSignal?.aborted
      ? '（生成已停止，未返回内容）'
      : '（模型未返回内容）';

    const assistantMessage = await messageService.createAssistantMessage(sessionId, finalContent, {
      modelId: model,
      thinkingContent: thinkingContent || undefined,
    });

    await sessionService.updateSessionStats(sessionId);
    yield { type: 'done', messageId: assistantMessage.id };
  } catch (err) {
    if (isAbortError(err) || abortSignal?.aborted) {
      log.info({ err }, '聊天流式生成已中止');
      return;
    }

    log.error({ err }, '聊天流式生成出错');
    if (userMessageId) {
      try {
        await messageService.createAssistantMessage(sessionId, `（生成失败：${(err as Error).message}）`);
        await sessionService.updateSessionStats(sessionId);
      } catch (saveErr) {
        log.error({ err: saveErr }, '保存助手错误占位消息失败');
      }
    }
    yield { type: 'error', error: (err as Error).message };
  }
}
