import { db } from '../db/index.js';
import { messages, attachments } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';

export async function listMessages(sessionId: string, options?: { limit?: number; offset?: number }) {
  const msgs = await db.select().from(messages)
    .where(and(
      eq(messages.sessionId, sessionId),
      eq(messages.isDeleted, false)
    ))
    .orderBy(messages.createdAt);

  // Fetch attachments for each message
  const result = [];
  for (const msg of msgs) {
    const atts = await db.select().from(attachments)
      .where(eq(attachments.messageId, msg.id));
    result.push({ ...msg, attachments: atts });
  }

  if (options?.limit) {
    return result.slice(options.offset || 0, (options.offset || 0) + options.limit);
  }

  return result;
}

export async function getMessageById(id: string) {
  const [message] = await db.select().from(messages)
    .where(eq(messages.id, id))
    .limit(1);
  return message || null;
}

export async function createUserMessage(
  sessionId: string,
  content: string,
  options?: {
    parentId?: string;
    version?: number;
  }
) {
  const [message] = await db.insert(messages).values({
    sessionId,
    role: 'user',
    content,
    parentId: options?.parentId || null,
    version: options?.version || 1,
  }).returning();
  return message;
}

export async function createAssistantMessage(
  sessionId: string,
  content: string,
  options?: {
    modelId?: string;
    tokensUsed?: number;
    thinkingContent?: string;
  }
) {
  const [message] = await db.insert(messages).values({
    sessionId,
    role: 'assistant',
    content,
    modelId: options?.modelId || null,
    tokensUsed: options?.tokensUsed || null,
    thinkingContent: options?.thinkingContent || null,
  }).returning();
  return message;
}

export async function softDeleteMessage(id: string) {
  const [message] = await db.update(messages)
    .set({ isDeleted: true })
    .where(eq(messages.id, id))
    .returning();
  return message || null;
}

export async function updateMessageContent(id: string, content: string) {
  const [message] = await db.update(messages)
    .set({ content })
    .where(eq(messages.id, id))
    .returning();
  return message || null;
}

export async function addFeedback(id: string, feedback: 'like' | 'dislike') {
  const [message] = await db.update(messages)
    .set({ feedback })
    .where(eq(messages.id, id))
    .returning();
  return message || null;
}

export async function deleteAssistantMessagesAfter(sessionId: string, afterMessageId: string) {
  const targetMessage = await getMessageById(afterMessageId);
  if (!targetMessage) return;

  await db.update(messages)
    .set({ isDeleted: true })
    .where(and(
      eq(messages.sessionId, sessionId),
      eq(messages.role, 'assistant'),
      sql`${messages.createdAt} >= ${targetMessage.createdAt}`
    ));
}

export async function getLatestUserMessage(sessionId: string) {
  const [message] = await db.select().from(messages)
    .where(and(
      eq(messages.sessionId, sessionId),
      eq(messages.role, 'user'),
      eq(messages.isDeleted, false)
    ))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return message || null;
}

export async function getLatestAssistantMessage(sessionId: string) {
  const [message] = await db.select().from(messages)
    .where(and(
      eq(messages.sessionId, sessionId),
      eq(messages.role, 'assistant'),
      eq(messages.isDeleted, false)
    ))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return message || null;
}

export async function createAttachment(
  messageId: string,
  fileName: string,
  fileType: string,
  extractedText?: string | null,
  base64?: string | null
) {
  const [attachment] = await db.insert(attachments).values({
    messageId,
    fileName,
    fileType,
    extractedText: extractedText || null,
    base64: base64 || null,
  }).returning();
  return attachment;
}

export async function getAttachmentsByMessageId(messageId: string) {
  return db.select().from(attachments)
    .where(eq(attachments.messageId, messageId));
}
