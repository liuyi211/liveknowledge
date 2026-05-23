import { create } from 'zustand';
import { api } from '@/lib/api';
import { readSseStream } from '@/lib/sse';
import type { ChatSession, Message } from '@/types';

interface ChatStore {
  sessions: ChatSession[];
  sessionsLoading: boolean;
  sessionsSearchQuery: string;
  setSessionsSearchQuery: (q: string) => void;
  loadSessions: () => Promise<void>;
  createSession: (params?: { title?: string; personaId?: string; modelId?: string }) => Promise<ChatSession>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  updateSessionPersona: (id: string, personaId: string | null) => Promise<void>;
  clearSession: (id: string) => Promise<void>;

  currentSession: ChatSession | null;
  setCurrentSession: (session: ChatSession | null) => void;
  loadSessionMessages: (sessionId: string) => Promise<void>;

  messages: Message[];
  messagesLoading: boolean;
  sendMessage: (content: string, attachments?: Array<{ fileName: string; fileType: string; extractedText?: string; base64?: string }>, modelId?: string) => Promise<void>;
  editAndResend: (messageId: string, newContent: string) => Promise<void>;
  regenerateMessage: (messageId: string, modelId?: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  feedbackMessage: (messageId: string, feedback: 'like' | 'dislike') => Promise<void>;

  sessionAttachments: Array<{ fileName: string; fileType: string; extractedText?: string; base64?: string; mode?: 'vision' | 'text'; extractedTextLength?: number; warning?: string }>;
  addSessionAttachment: (att: { fileName: string; fileType: string; extractedText?: string; base64?: string; mode?: 'vision' | 'text'; extractedTextLength?: number; warning?: string }) => void;
  removeSessionAttachment: (index: number) => void;
  clearSessionAttachments: () => void;

  isStreaming: boolean;
  streamingContent: string;
  thinkingContent: string;
  abortStream: (() => void) | null;
  setAbortStream: (fn: (() => void) | null) => void;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function createTempMessage(role: 'user' | 'assistant', sessionId: string, content = ''): Message {
  return {
    id: `temp-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sessionId,
    role,
    content,
    modelId: null,
    tokensUsed: null,
    parentId: null,
    version: 1,
    isDeleted: false,
    feedback: null,
    thinkingContent: null,
    createdAt: new Date().toISOString(),
  };
}

type StoreSet = (partial: Partial<ChatStore> | ((state: ChatStore) => Partial<ChatStore>)) => void;

type ChatStreamEvent =
  | { type: 'ping' }
  | { type: 'chunk'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; error: string };

function updateLastAssistant(set: StoreSet, content: string, thinkingContent?: string) {
  set((state) => {
    const messages = [...state.messages];
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
      lastMsg.content = content;
      if (thinkingContent !== undefined) {
        lastMsg.thinkingContent = thinkingContent;
      }
    }
    return { messages };
  });
}

function setLastAssistantError(set: StoreSet, content: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  updateLastAssistant(set, content + '\n\n[Error: ' + message + ']');
}

function createStreamingUpdater(set: StoreSet) {
  let latestContent = '';
  let latestThinkingContent = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    set({
      streamingContent: latestContent,
      thinkingContent: latestThinkingContent,
    });
  };

  const schedule = () => {
    if (timer !== null) return;
    timer = setTimeout(flush, 32);
  };

  return {
    update(content: string, thinkingContent: string) {
      latestContent = content;
      latestThinkingContent = thinkingContent;
      schedule();
    },
    flushNow() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      set({
        streamingContent: latestContent,
        thinkingContent: latestThinkingContent,
      });
    },
  };
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  sessionsLoading: false,
  sessionsSearchQuery: '',
  setSessionsSearchQuery: (q) => set({ sessionsSearchQuery: q }),

  loadSessions: async () => {
    set({ sessionsLoading: true });
    try {
      const sessions = await api.sessions.list();
      set({ sessions });
    } finally {
      set({ sessionsLoading: false });
    }
  },

  createSession: async (params = {}) => {
    const session = await api.sessions.create(params);
    set((state) => ({ sessions: [session, ...state.sessions], currentSession: session, messages: [], sessionAttachments: [] }));
    return session;
  },

  deleteSession: async (id) => {
    await api.sessions.delete(id);
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id);
      const currentSession = state.currentSession?.id === id ? null : state.currentSession;
      return { sessions, currentSession, messages: currentSession ? state.messages : [], sessionAttachments: currentSession ? state.sessionAttachments : [] };
    });
  },

  renameSession: async (id, title) => {
    await api.sessions.update(id, { title });
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, title } : s)),
      currentSession: state.currentSession?.id === id ? { ...state.currentSession, title } : state.currentSession,
    }));
  },

  updateSessionPersona: async (id, personaId) => {
    const session = await api.sessions.update(id, { personaId });
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...session } : s)),
      currentSession: state.currentSession?.id === id ? { ...state.currentSession, ...session } : state.currentSession,
    }));
  },

  clearSession: async (id) => {
    await api.sessions.clear(id);
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, messageCount: 0, lastMessagePreview: null } : s)),
      messages: state.currentSession?.id === id ? [] : state.messages,
      sessionAttachments: state.currentSession?.id === id ? [] : state.sessionAttachments,
    }));
  },

  currentSession: null,
  setCurrentSession: (session) => set({ currentSession: session, sessionAttachments: [] }),

  loadSessionMessages: async (sessionId) => {
    set({ messagesLoading: true });
    try {
      const data = await api.sessions.get(sessionId);
      set({ messages: data.messages || [], currentSession: data });
    } finally {
      set({ messagesLoading: false });
    }
  },

  messages: [],
  messagesLoading: false,

  sessionAttachments: [],
  addSessionAttachment: (att) => set((state) => ({
    sessionAttachments: [...state.sessionAttachments, att],
  })),
  removeSessionAttachment: (index) => set((state) => ({
    sessionAttachments: state.sessionAttachments.filter((_, i) => i !== index),
  })),
  clearSessionAttachments: () => set({ sessionAttachments: [] }),

  sendMessage: async (content, attachments = [], modelId) => {
    const { currentSession } = get();
    if (!currentSession) return;

    const tempUserMsg = createTempMessage('user', currentSession.id, content);
    const tempAssistantMsg = createTempMessage('assistant', currentSession.id);

    set((state) => ({
      messages: [...state.messages, tempUserMsg, tempAssistantMsg],
      isStreaming: true,
      streamingContent: '',
      thinkingContent: '',
    }));

    let fullContent = '';
    let thinkingContent = '';
    const abortController = new AbortController();
    const streamUpdater = createStreamingUpdater(set);
    set({ abortStream: () => abortController.abort() });

    try {
      const response = await api.messages.sendStream(currentSession.id, { content, attachments, modelId }, abortController.signal);
      await readSseStream<ChatStreamEvent>(response, async (data) => {
        if (data.type === 'chunk') {
          fullContent += data.content;
          streamUpdater.update(fullContent, thinkingContent);
        } else if (data.type === 'thinking') {
          thinkingContent += data.content;
          streamUpdater.update(fullContent, thinkingContent);
        } else if (data.type === 'done') {
          streamUpdater.flushNow();
          set({ isStreaming: false, abortStream: null });
          // Refresh to get real IDs
          const sessionData = await api.sessions.get(currentSession.id);
          set({ messages: sessionData.messages || [] });
          return false;
        } else if (data.type === 'error') {
          streamUpdater.flushNow();
          set({ isStreaming: false, abortStream: null });
          set((state) => {
            const messages = [...state.messages];
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.content = fullContent + '\n\n[Error: ' + data.error + ']';
            }
            return { messages };
          });
          return false;
        }
      }, abortController.signal);
    } catch (err) {
      streamUpdater.flushNow();
      if (isAbortError(err)) {
        return;
      }

      set((state) => {
        const messages = [...state.messages];
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.content = fullContent + '\n\n[Error: ' + (err as Error).message + ']';
        }
        return { messages };
      });
    } finally {
      if (abortController.signal.aborted) {
        try {
          const sessionData = await api.sessions.get(currentSession.id);
          set({ messages: sessionData.messages || [] });
        } catch {
          // Keep the local partial message if refresh fails.
        }
      }
      set({ isStreaming: false, abortStream: null });
      get().loadSessions();
    }
  },

  editAndResend: async (messageId, newContent) => {
    const { currentSession } = get();
    if (!currentSession) return;

    const tempUserMsg = createTempMessage('user', currentSession.id, newContent);
    const tempAssistantMsg = createTempMessage('assistant', currentSession.id);

    set((state) => {
      const editIndex = state.messages.findIndex((message) => message.id === messageId);
      const messages = editIndex >= 0
        ? [...state.messages.slice(0, editIndex), tempUserMsg, tempAssistantMsg]
        : [...state.messages, tempUserMsg, tempAssistantMsg];
      return {
        messages,
        isStreaming: true,
        streamingContent: '',
        thinkingContent: '',
      };
    });

    let fullContent = '';
    let thinkingContent = '';
    const abortController = new AbortController();
    const streamUpdater = createStreamingUpdater(set);
    set({ abortStream: () => abortController.abort() });

    try {
      const response = await api.messages.sendStream(currentSession.id, {
        content: newContent,
        action: 'editAndResend',
        messageId,
      }, abortController.signal);
      await readSseStream<ChatStreamEvent>(response, async (data) => {
        if (data.type === 'chunk') {
          fullContent += data.content;
          streamUpdater.update(fullContent, thinkingContent);
        } else if (data.type === 'thinking') {
          thinkingContent += data.content;
          streamUpdater.update(fullContent, thinkingContent);
        } else if (data.type === 'done' || data.type === 'error') {
          streamUpdater.flushNow();
          set({ isStreaming: false, abortStream: null });
          const sessionData = await api.sessions.get(currentSession.id);
          set({ messages: sessionData.messages || [] });
          return false;
        }
      }, abortController.signal);
    } catch (err) {
      streamUpdater.flushNow();
      if (!isAbortError(err)) {
        setLastAssistantError(set, fullContent, err);
      }
    } finally {
      if (abortController.signal.aborted) {
        try {
          const sessionData = await api.sessions.get(currentSession.id);
          set({ messages: sessionData.messages || [] });
        } catch {
          // Keep local state if refresh fails.
        }
      }
      set({ isStreaming: false, abortStream: null });
      get().loadSessions();
    }
  },

  regenerateMessage: async (messageId, modelId) => {
    const { currentSession } = get();
    if (!currentSession) return;

    const tempAssistantMsg = createTempMessage('assistant', currentSession.id);

    set((state) => {
      const targetIndex = state.messages.findIndex((message) => message.id === messageId);
      const messages = targetIndex >= 0
        ? [
          ...state.messages.slice(0, targetIndex),
          tempAssistantMsg,
          ...state.messages.slice(targetIndex + 1),
        ]
        : [...state.messages, tempAssistantMsg];

      return {
        messages,
        isStreaming: true,
        streamingContent: '',
        thinkingContent: '',
      };
    });

    let fullContent = '';
    let thinkingContent = '';
    const abortController = new AbortController();
    const streamUpdater = createStreamingUpdater(set);
    set({ abortStream: () => abortController.abort() });

    try {
      const response = await api.messages.sendStream(currentSession.id, {
        content: '',
        action: 'regenerate',
        messageId,
        modelId,
      }, abortController.signal);
      await readSseStream<ChatStreamEvent>(response, async (data) => {
        if (data.type === 'chunk') {
          fullContent += data.content;
          streamUpdater.update(fullContent, thinkingContent);
        } else if (data.type === 'thinking') {
          thinkingContent += data.content;
          streamUpdater.update(fullContent, thinkingContent);
        } else if (data.type === 'done' || data.type === 'error') {
          streamUpdater.flushNow();
          set({ isStreaming: false, abortStream: null });
          const sessionData = await api.sessions.get(currentSession.id);
          set({ messages: sessionData.messages || [] });
          return false;
        }
      }, abortController.signal);
    } catch (err) {
      streamUpdater.flushNow();
      if (!isAbortError(err)) {
        setLastAssistantError(set, fullContent, err);
      }
    } finally {
      if (abortController.signal.aborted) {
        try {
          const sessionData = await api.sessions.get(currentSession.id);
          set({ messages: sessionData.messages || [] });
        } catch {
          // Keep local state if refresh fails.
        }
      }
      set({ isStreaming: false, abortStream: null });
      get().loadSessions();
    }
  },

  deleteMessage: async (messageId) => {
    await api.messages.delete(messageId);
    set((state) => {
      const targetIndex = state.messages.findIndex((message) => message.id === messageId);
      if (targetIndex < 0) {
        return { messages: state.messages };
      }

      const targetMessage = state.messages[targetIndex];
      if (targetMessage.role !== 'user') {
        return { messages: state.messages.filter((message) => message.id !== messageId) };
      }

      const nextUserIndex = state.messages.findIndex(
        (message, index) => index > targetIndex && message.role === 'user'
      );
      const deleteUntilIndex = nextUserIndex >= 0 ? nextUserIndex : state.messages.length;

      return {
        messages: [
          ...state.messages.slice(0, targetIndex),
          ...state.messages.slice(deleteUntilIndex),
        ],
      };
    });
    get().loadSessions();
  },

  feedbackMessage: async (messageId, feedback) => {
    await api.messages.feedback(messageId, feedback);
    set((state) => ({
      messages: state.messages.map((m) => (m.id === messageId ? { ...m, feedback } : m)),
    }));
  },

  isStreaming: false,
  streamingContent: '',
  thinkingContent: '',
  abortStream: null,
  setAbortStream: (fn) => set({ abortStream: fn }),
}));
