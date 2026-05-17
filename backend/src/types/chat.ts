export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  providerType?: string;
}

export interface StreamChunk {
  type: 'chunk' | 'thinking';
  content: string;
}

export interface SendMessageBody {
  content: string;
  action?: 'send' | 'editAndResend' | 'regenerate';
  messageId?: string;
  modelId?: string;
  attachments?: Array<{
    fileName: string;
    fileType: string;
    extractedText?: string;
    filePath?: string;
  }>;
}
