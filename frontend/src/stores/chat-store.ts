import { create } from 'zustand';
import { api } from '@/lib/api';
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
    set({ abortStream: () => abortController.abort() });

    try {
      const response = await api.messages.sendStream(currentSession.id, { content, attachments, modelId }, abortController.signal);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';

      while (!done && !abortController.signal.aborted) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone || abortController.signal.aborted;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'chunk') {
              fullContent += data.content;
              set({ streamingContent: fullContent });
              updateLastAssistant(set, fullContent);
            } else if (data.type === 'thinking') {
              thinkingContent += data.content;
              set({ thinkingContent });
              updateLastAssistant(set, fullContent, thinkingContent);
            } else if (data.type === 'done') {
              done = true;
              // Refresh to get real IDs
              const sessionData = await api.sessions.get(currentSession.id);
              set({ messages: sessionData.messages || [] });
            } else if (data.type === 'error') {
              set((state) => {
                const messages = [...state.messages];
                const lastMsg = messages[messages.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                  lastMsg.content = fullContent + '\n\n[Error: ' + data.error + ']';
                }
                return { messages };
              });
              done = true;
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
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
    set({ abortStream: () => abortController.abort() });

    try {
      const response = await api.messages.sendStream(currentSession.id, {
        content: newContent,
        action: 'editAndResend',
        messageId,
      }, abortController.signal);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';

      while (!done && !abortController.signal.aborted) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone || abortController.signal.aborted;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'chunk') {
              fullContent += data.content;
              set({ streamingContent: fullContent });
              updateLastAssistant(set, fullContent);
            } else if (data.type === 'thinking') {
              thinkingContent += data.content;
              set({ thinkingContent });
              updateLastAssistant(set, fullContent, thinkingContent);
            } else if (data.type === 'done') {
              done = true;
              const sessionData = await api.sessions.get(currentSession.id);
              set({ messages: sessionData.messages || [] });
            } else if (data.type === 'error') {
              done = true;
              const sessionData = await api.sessions.get(currentSession.id);
              set({ messages: sessionData.messages || [] });
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      if (!isAbortError(err)) {
        const sessionData = await api.sessions.get(currentSession.id);
        set({ messages: sessionData.messages || [] });
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
    set({ abortStream: () => abortController.abort() });

    try {
      const response = await api.messages.sendStream(currentSession.id, {
        content: '',
        action: 'regenerate',
        messageId,
        modelId,
      }, abortController.signal);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';

      while (!done && !abortController.signal.aborted) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone || abortController.signal.aborted;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'chunk') {
              fullContent += data.content;
              set({ streamingContent: fullContent });
              updateLastAssistant(set, fullContent);
            } else if (data.type === 'thinking') {
              thinkingContent += data.content;
              set({ thinkingContent });
              updateLastAssistant(set, fullContent, thinkingContent);
            } else if (data.type === 'done') {
              done = true;
              const sessionData = await api.sessions.get(currentSession.id);
              set({ messages: sessionData.messages || [] });
            } else if (data.type === 'error') {
              done = true;
              const sessionData = await api.sessions.get(currentSession.id);
              set({ messages: sessionData.messages || [] });
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      if (!isAbortError(err)) {
        const sessionData = await api.sessions.get(currentSession.id);
        set({ messages: sessionData.messages || [] });
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
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    }));
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
