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
  sourceType: string | null;
  sourceId: string | null;
  sourceMetadata: Record<string, unknown> | null;
  version: number;
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

export interface Card {
  id: string;
  userId: string;
  noteId: string | null;
  front: string;
  back: string;
  type: 'basic' | 'cloze' | 'image_occlusion';
  tags: string[] | null;
  difficulty: number;
  halfLife: number;
  retrievability: number;
  lastReviewedAt: string | null;
  nextReviewAt: string;
  reviewCount: number;
  lapseCount: number;
  suspended: boolean;
  qualityReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCard extends Card {
  noteTitle: string | null;
  noteSummary: string | null;
  dueStatus: 'new' | 'learning' | 'review' | 'lapsed';
  predictedIntervals: {
    again: string;
    hard: string;
    good: string;
    easy: string;
  };
}

export interface ReviewStats {
  dueCount: number;
  reviewedToday: number;
  accuracyToday: number | null;
  groups?: {
    newCount: number;
    reviewCount: number;
    lapsedCount: number;
  };
  weakCount?: number;
  rewriteSuggestedCount?: number;
  upcoming: {
    today: number;
    tomorrow: number;
    week: number;
  };
  dailyLoad?: Array<{ date: string; count: number }>;
}

export interface ReviewFilters {
  tags: Array<{ tag: string; count: number }>;
  notes: Array<{ noteId: string; title: string; count: number }>;
}
