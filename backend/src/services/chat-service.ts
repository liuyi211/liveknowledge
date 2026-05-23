import { streamChat, supportsVision } from './ai-provider.js';
import { assembleChatContext } from './context-assembly-service.js';
import * as sessionService from './session-service.js';
import * as messageService from './message-service.js';
import { extractLongTermMemoriesAfterTurn } from './long-term-memory-service.js';
import { enqueueMemoryTask } from './memory-task-queue.js';
import { updateSessionRollingSummaryAfterTurn } from './session-memory-service.js';
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

      const newMessage = await messageService.replaceUserMessageAndDeleteFollowing(
        sessionId,
        messageId,
        content
      );
      if (!newMessage) {
        yield { type: 'error', error: 'Message not found' };
        return;
      }
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

    const imageFiles = imageAttachments.map((attachment) => ({
      fileType: attachment.fileType,
      base64: attachment.base64 || '',
    }));

    if (imageFiles.length > 0 && !supportsVision(model)) {
      yield { type: 'error', error: `模型 ${model} 不支持图片输入，请切换到支持视觉的模型` };
      return;
    }

    const context = await assembleChatContext({
      userId,
      sessionId,
      query: effectiveContent,
      model,
      attachmentTexts: textAttachments,
      imageAttachments: imageFiles,
      currentUserMessageId: userMessageId,
      log,
    });

    log.debug({ context: context.diagnostics }, 'Assembled chat context');

    let fullContent = '';
    let thinkingContent = '';

    for await (const chunk of streamChat(userId, {
      model,
      messages: context.messages,
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
    const sourceMessageIds = [userMessageId, assistantMessage.id].filter(Boolean) as string[];
    enqueueMemoryTask({
      name: 'session-summary',
      log,
      run: () => updateSessionRollingSummaryAfterTurn(userId, sessionId, {
        force: action !== 'send',
        log,
      }),
    });
    enqueueMemoryTask({
      name: 'long-term-memory-extraction',
      log,
      run: () => extractLongTermMemoriesAfterTurn(userId, sessionId, sourceMessageIds, log),
    });
    yield { type: 'done', messageId: assistantMessage.id };
  } catch (err) {
    if (isAbortError(err) || abortSignal?.aborted) {
      log.info({ err }, 'Chat stream generation aborted');
      return;
    }

    log.error({ err }, 'Chat stream generation failed');
    if (userMessageId) {
      try {
        await messageService.createAssistantMessage(sessionId, `（生成失败：${(err as Error).message}）`);
        await sessionService.updateSessionStats(sessionId);
      } catch (saveErr) {
        log.error({ err: saveErr }, 'Failed to save assistant error placeholder');
      }
    }
    yield { type: 'error', error: (err as Error).message };
  }
}
