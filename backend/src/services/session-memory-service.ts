import { and, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { db } from '../db/index.js';
import { chatSessions, messages } from '../db/schema.js';
import { chat, getDefaultChatModel } from './ai-provider.js';

const RECENT_RAW_MESSAGE_COUNT = 12;
const MIN_MESSAGES_TO_SUMMARIZE = 8;
const MAX_TRANSCRIPT_CHARS = 12000;
const MAX_SUMMARY_CHARS = 1800;

type MessageForSummary = {
  id: string;
  role: string;
  content: string;
};

export async function updateSessionRollingSummaryAfterTurn(
  userId: string,
  sessionId: string,
  options: { force?: boolean; log?: Pick<FastifyBaseLogger, 'warn' | 'debug'> } = {}
): Promise<void> {
  const [session] = await db.select().from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    .limit(1);
  if (!session) return;

  const sessionMessages = await db.select({
    id: messages.id,
    role: messages.role,
    content: messages.content,
  }).from(messages)
    .where(and(eq(messages.sessionId, sessionId), eq(messages.isDeleted, false)))
    .orderBy(messages.createdAt);

  if (sessionMessages.length <= RECENT_RAW_MESSAGE_COUNT) return;

  const recentStartIndex = Math.max(0, sessionMessages.length - RECENT_RAW_MESSAGE_COUNT);
  const boundaryIndex = options.force
    ? 0
    : findBoundaryIndex(sessionMessages, session.contextSummaryUpToMessageId);
  const messagesToSummarize = sessionMessages.slice(boundaryIndex, recentStartIndex);

  if (!options.force && messagesToSummarize.length < MIN_MESSAGES_TO_SUMMARIZE) return;
  if (messagesToSummarize.length === 0) return;

  const nextSummary = await summarizeMessages({
    userId,
    previousSummary: options.force ? null : session.contextSummary,
    messagesToSummarize,
    log: options.log,
  });
  const boundaryMessage = messagesToSummarize[messagesToSummarize.length - 1];

  await db.update(chatSessions)
    .set({
      contextSummary: nextSummary,
      contextSummaryUpdatedAt: new Date(),
      contextSummaryUpToMessageId: boundaryMessage.id,
      contextSummaryVersion: (session.contextSummaryVersion || 0) + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)));

  options.log?.debug?.({
    sessionId,
    summarizedMessages: messagesToSummarize.length,
    summaryLength: nextSummary.length,
  }, 'Updated session rolling summary');
}

function findBoundaryIndex(sessionMessages: MessageForSummary[], boundaryMessageId?: string | null): number {
  if (!boundaryMessageId) return 0;
  const index = sessionMessages.findIndex(message => message.id === boundaryMessageId);
  return index >= 0 ? index + 1 : 0;
}

async function summarizeMessages(input: {
  userId: string;
  previousSummary?: string | null;
  messagesToSummarize: MessageForSummary[];
  log?: Pick<FastifyBaseLogger, 'warn'>;
}): Promise<string> {
  const transcript = formatTranscript(input.messagesToSummarize).slice(0, MAX_TRANSCRIPT_CHARS);
  const fallback = buildFallbackSummary(input.previousSummary, input.messagesToSummarize);

  try {
    const defaultConfig = await getDefaultChatModel(input.userId);
    const response = await chat(input.userId, {
      model: defaultConfig.model,
      providerType: defaultConfig.providerType,
      messages: [{
        role: 'user',
        content: [
          '请维护一份当前会话的滚动摘要，用于让模型在长对话中延续上下文。',
          '',
          '要求：',
          '1. 合并旧摘要和新增对话，不要重复记录。',
          '2. 保留用户目标、已达成结论、关键约定、未解决问题、重要实体。',
          '3. 不要添加原对话没有的信息。',
          '4. 用简洁中文输出，不超过 900 字。',
          '',
          `旧摘要：\n${input.previousSummary || '无'}`,
          '',
          `新增对话：\n${transcript}`,
        ].join('\n'),
      }],
      temperature: 0.2,
      maxTokens: 1200,
    }, createSummaryLogger(input.log));

    const summary = response.content.trim();
    return (summary || fallback).slice(0, MAX_SUMMARY_CHARS);
  } catch (err) {
    input.log?.warn?.({ err }, 'Failed to update session rolling summary');
    return fallback.slice(0, MAX_SUMMARY_CHARS);
  }
}

function formatTranscript(sessionMessages: MessageForSummary[]): string {
  return sessionMessages
    .map(message => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
    .join('\n\n');
}

function buildFallbackSummary(previousSummary: string | null | undefined, sessionMessages: MessageForSummary[]): string {
  const recentFacts = sessionMessages
    .slice(-8)
    .map(message => `${message.role === 'user' ? '用户' : '助手'}：${message.content.slice(0, 240)}`)
    .join('\n');

  return [previousSummary, recentFacts].filter(Boolean).join('\n\n');
}

function createSummaryLogger(log?: Pick<FastifyBaseLogger, 'warn'>): FastifyBaseLogger {
  return {
    info: () => {},
    error: () => {},
    warn: (obj: unknown, msg?: string) => log?.warn?.(obj, msg || 'Session summary warning'),
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    child: () => createSummaryLogger(log),
    silent: () => {},
  } as any;
}
