import { db } from '../db/index.js';
import { messages } from '../db/schema.js';
import { and, desc, eq, ne } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { ChatMessage } from './ai-provider.js';
import { isImageFile } from './file-handler.js';
import { getProfileSummary } from './profile-service.js';
import { retrieveContext } from './retrieval/index.js';
import * as sessionService from './session-service.js';
import { allocateContextBudget, estimateTokens, type ContextBudget } from './context-budget-service.js';
import { formatMemoriesForPrompt, retrieveRelevantMemories } from './long-term-memory-service.js';

const RECENT_CONTEXT_MESSAGE_CANDIDATE_LIMIT = 80;

export interface AssembleChatContextInput {
  userId: string;
  sessionId: string;
  query: string;
  model?: string | null;
  attachmentTexts: string[];
  imageAttachments?: Array<{ fileType: string; base64: string }>;
  currentUserMessageId?: string;
  log: FastifyBaseLogger;
}

export interface AssembledChatContext {
  systemPrompt: string;
  messages: ChatMessage[];
  budgets: ContextBudget;
  diagnostics: {
    profileIncluded: boolean;
    sessionSummaryIncluded: boolean;
    longTermMemoryCount: number;
    ragIncluded: boolean;
    recentMessageCount: number;
  };
}

export async function assembleChatContext(input: AssembleChatContextInput): Promise<AssembledChatContext> {
  const budgets = allocateContextBudget({
    model: input.model,
    attachmentTexts: input.attachmentTexts,
    query: input.query,
  });
  const systemResult = await buildSystemPrompt(input, budgets);
  const chatMessages = await buildChatMessages({
    sessionId: input.sessionId,
    systemPrompt: systemResult.systemPrompt,
    userContent: input.query,
    imageAttachments: input.imageAttachments,
    currentUserMessageId: input.currentUserMessageId,
    maxHistoryTokens: budgets.recentMessages,
  });

  return {
    systemPrompt: systemResult.systemPrompt,
    messages: chatMessages.messages,
    budgets,
    diagnostics: {
      ...systemResult.diagnostics,
      recentMessageCount: chatMessages.recentMessageCount,
    },
  };
}

async function buildSystemPrompt(input: AssembleChatContextInput, budgets: ContextBudget): Promise<{
  systemPrompt: string;
  diagnostics: Omit<AssembledChatContext['diagnostics'], 'recentMessageCount'>;
}> {
  let systemPrompt = '你是通用助手。请用中文自然、清晰地回答用户问题。人格不预设专业角色；本地知识库检索结果优先作为事实依据。';
  let profileIncluded = false;
  let sessionSummaryIncluded = false;
  let longTermMemoryCount = 0;
  let ragIncluded = false;

  const session = await sessionService.getSessionById(input.sessionId, input.userId);
  if (session?.personaId) {
    const persona = await sessionService.getPersonaForSession(session.personaId, input.userId);
    if (persona) {
      systemPrompt = persona.systemPromptTemplate;
    }
  }

  if (session?.contextSummary) {
    sessionSummaryIncluded = true;
    systemPrompt += `\n\n【当前会话滚动摘要】\n${session.contextSummary}`;
  }

  systemPrompt += '\n\n如果用户重复提出与上一轮相同或高度相似的问题，请结合已有回答换一种组织方式补充新的角度、例子或更简洁的总结，不要机械复述上一轮答案。';

  try {
    const profileSummary = await getProfileSummary(input.userId);
    if (profileSummary) {
      profileIncluded = true;
      systemPrompt += `\n\n【用户认知画像】\n${profileSummary}\n请只把这份画像用于调整解释方式、节奏和复习建议；不要向用户暴露原始画像字段，除非用户明确询问。`;
    }
  } catch (err) {
    input.log.warn({ err, userId: input.userId }, 'Failed to load cognitive profile summary for chat prompt');
  }

  try {
    const memories = await retrieveRelevantMemories(input.userId, input.query, session?.contextSummary, 8);
    const memoryPrompt = formatMemoriesForPrompt(memories, budgets.longTermMemory);
    if (memoryPrompt) {
      longTermMemoryCount = memories.length;
      systemPrompt += `\n\n銆愮浉鍏抽暱鏈熻蹇嗐€慭n${memoryPrompt}\n璇峰皢杩欎簺璁板繂浠呯敤浜庝釜鎬у寲鍜屼笂涓嬫枃琛ュ叏锛涘鏋滀笌鏈€杩戝師鏂囨秷鎭啿绐侊紝浠ユ渶杩戞秷鎭负鍑嗐€?`;
    }
  } catch (err) {
    input.log.warn({ err, userId: input.userId }, 'Failed to load long-term memories for chat prompt');
  }

  const contextStr = await retrieveContext(input.query, input.userId, session?.contextSummary);
  if (contextStr) {
    ragIncluded = true;
    systemPrompt += `\n\n【知识库 RAG 检索结果】\n${contextStr}`;
  }

  if (input.attachmentTexts.length > 0) {
    systemPrompt += `\n\n用户上传了以下文件内容，请在回答时参考：\n\n${input.attachmentTexts.join('\n---\n')}`;
  }

  input.log.debug({ promptLength: systemPrompt.length }, 'Built chat system prompt');
  input.log.debug({
    promptLength: systemPrompt.length,
    budgets,
    profileIncluded,
    sessionSummaryIncluded,
    longTermMemoryCount,
    ragIncluded,
  }, 'Chat context assembly diagnostics');

  return {
    systemPrompt,
    diagnostics: {
      profileIncluded,
      sessionSummaryIncluded,
      longTermMemoryCount,
      ragIncluded,
    },
  };
}

async function buildChatMessages(input: {
  sessionId: string;
  systemPrompt: string;
  userContent: string;
  imageAttachments?: Array<{ fileType: string; base64: string }>;
  currentUserMessageId?: string;
  maxHistoryTokens: number;
}): Promise<{ messages: ChatMessage[]; recentMessageCount: number }> {
  const conditions = [
    eq(messages.sessionId, input.sessionId),
    eq(messages.isDeleted, false),
  ];
  if (input.currentUserMessageId) {
    conditions.push(ne(messages.id, input.currentUserMessageId));
  }

  const recentMessages = await db.select().from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(RECENT_CONTEXT_MESSAGE_CANDIDATE_LIMIT);

  const selectedHistory = selectMessagesWithinBudget(
    recentMessages.reverse(),
    input.maxHistoryTokens
  );

  const chatMessages: ChatMessage[] = [{ role: 'system', content: input.systemPrompt }];
  for (const message of selectedHistory) {
    chatMessages.push({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    });
  }

  if (!input.imageAttachments?.length) {
    chatMessages.push({ role: 'user', content: input.userContent });
    return { messages: chatMessages, recentMessageCount: selectedHistory.length };
  }

  const contentParts: ChatMessage['content'] = [{ type: 'text', text: input.userContent }];
  for (const image of input.imageAttachments) {
    if (isImageFile(image.fileType) && image.base64) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: image.base64 },
      });
    }
  }
  chatMessages.push({ role: 'user', content: contentParts });
  return { messages: chatMessages, recentMessageCount: selectedHistory.length };
}

function selectMessagesWithinBudget<T extends { content: string }>(orderedMessages: T[], maxTokens: number): T[] {
  let usedTokens = 0;
  const selected: T[] = [];

  for (const message of orderedMessages.slice().reverse()) {
    const messageTokens = estimateTokens(message.content) + 8;
    if (selected.length > 0 && usedTokens + messageTokens > maxTokens) break;
    selected.push(message);
    usedTokens += messageTokens;
  }

  return selected.reverse();
}
