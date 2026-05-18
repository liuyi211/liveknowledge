export interface User {
  id: string;
  username: string;
}

export interface Persona {
  id: string;
  name: string;
  description: string | null;
  systemPromptTemplate: string;
  defaultModel: string | null;
}

export interface ChatSession {
  id: string;
  title: string;
  personaId: string | null;
  modelId: string | null;
  messageCount: number;
  lastMessagePreview: string | null;
  contextSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  messageId: string;
  fileName: string;
  fileType: string;
  extractedText: string | null;
  base64: string | null;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  modelId: string | null;
  tokensUsed: number | null;
  parentId: string | null;
  version: number;
  isDeleted: boolean;
  feedback: 'like' | 'dislike' | null;
  thinkingContent: string | null;
  createdAt: string;
  attachments?: Attachment[];
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[] | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}
