import { create } from 'zustand';
import type { User, Persona, ChatSession, Message, Note } from '@/types';

interface AppState {
  // Auth
  user: User | null;
  setUser: (user: User | null) => void;

  // Personas
  personas: Persona[];
  setPersonas: (personas: Persona[]) => void;
  selectedPersona: Persona | null;
  setSelectedPersona: (persona: Persona | null) => void;

  // Sessions
  sessions: ChatSession[];
  setSessions: (sessions: ChatSession[]) => void;
  currentSession: ChatSession | null;
  setCurrentSession: (session: ChatSession | null) => void;

  // Messages
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;

  // Notes
  notes: Note[];
  setNotes: (notes: Note[]) => void;
  selectedNote: Note | null;
  setSelectedNote: (note: Note | null) => void;

  // UI
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),

  personas: [],
  setPersonas: (personas) => set({ personas }),
  selectedPersona: null,
  setSelectedPersona: (selectedPersona) => set({ selectedPersona }),

  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  currentSession: null,
  setCurrentSession: (currentSession) => set({ currentSession }),

  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateLastMessage: (content) => set((state) => {
    const messages = [...state.messages];
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      lastMessage.content += content;
    }
    return { messages };
  }),

  notes: [],
  setNotes: (notes) => set({ notes }),
  selectedNote: null,
  setSelectedNote: (selectedNote) => set({ selectedNote }),

  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  isStreaming: false,
  setIsStreaming: (isStreaming) => set({ isStreaming }),
}));
