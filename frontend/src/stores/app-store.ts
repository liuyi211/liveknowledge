import { create } from 'zustand';
import type { User, Persona, ChatSession, Message, Note, Folder } from '@/types';

interface AppState {
  user: User | null;
  setUser: (user: User | null) => void;

  personas: Persona[];
  setPersonas: (personas: Persona[]) => void;
  selectedPersona: Persona | null;
  setSelectedPersona: (persona: Persona | null) => void;

  sessions: ChatSession[];
  setSessions: (sessions: ChatSession[]) => void;
  currentSession: ChatSession | null;
  setCurrentSession: (session: ChatSession | null) => void;

  messages: Message[];
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;

  notes: Note[];
  setNotes: (notes: Note[]) => void;
  selectedNote: Note | null;
  setSelectedNote: (note: Note | null) => void;

  folders: Folder[];
  setFolders: (folders: Folder[]) => void;
  expandedFolderIds: Set<string>;
  toggleFolderExpanded: (id: string) => void;
  expandFolder: (id: string) => void;
  collapseAllFolders: () => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;

  renamingItem: { type: 'note' | 'folder'; id: string } | null;
  setRenamingItem: (item: { type: 'note' | 'folder'; id: string } | null) => void;

  movingNoteId: string | null;
  setMovingNoteId: (id: string | null) => void;

  pendingDelete: { type: 'note' | 'folder'; id: string; name: string } | null;
  setPendingDelete: (item: { type: 'note' | 'folder'; id: string; name: string } | null) => void;

  dragData: { type: 'note' | 'folder'; id: string; forbiddenFolderIds: Set<string> } | null;
  setDragData: (data: { type: 'note' | 'folder'; id: string; forbiddenFolderIds: Set<string> } | null) => void;

  viewMode: Record<string, 'edit' | 'preview'>;
  setViewMode: (noteId: string, mode: 'edit' | 'preview') => void;

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

  folders: [],
  setFolders: (folders) => set({ folders }),
  expandedFolderIds: new Set<string>(),
  toggleFolderExpanded: (id) => set((state) => {
    const next = new Set(state.expandedFolderIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { expandedFolderIds: next };
  }),
  expandFolder: (id) => set((state) => {
    if (state.expandedFolderIds.has(id)) return state;
    const next = new Set(state.expandedFolderIds);
    next.add(id);
    return { expandedFolderIds: next };
  }),
  collapseAllFolders: () => set({ expandedFolderIds: new Set() }),

  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  renamingItem: null,
  setRenamingItem: (renamingItem) => set({ renamingItem }),

  movingNoteId: null,
  setMovingNoteId: (movingNoteId) => set({ movingNoteId }),

  pendingDelete: null,
  setPendingDelete: (pendingDelete) => set({ pendingDelete }),

  dragData: null,
  setDragData: (dragData) => set({ dragData }),

  viewMode: {},
  setViewMode: (noteId, mode) => set((state) => ({
    viewMode: { ...state.viewMode, [noteId]: mode },
  })),

  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  isStreaming: false,
  setIsStreaming: (isStreaming) => set({ isStreaming }),
}));
