'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import NoteList from '@/components/notes/NoteList';
import NoteEditor from '@/components/notes/NoteEditor';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';

export default function NotesPage() {
  const router = useRouter();
  const [pageLoading, setPageLoading] = useState(true);
  const setNotes = useAppStore((s) => s.setNotes);
  const notes = useAppStore((s) => s.notes);
  const setNotesStore = useAppStore((s) => s.setNotes);
  const selectedNote = useAppStore((s) => s.selectedNote);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);

  useEffect(() => {
    api.auth.me()
      .then(() => setPageLoading(false))
      .catch(() => router.push('/login'));
    api.notes.list().then(setNotes);
  }, [router, setNotes]);

  const createNote = async () => {
    const note = await api.notes.create({
      title: 'Untitled Note',
      content: '',
    });
    setNotesStore([note, ...notes]);
    setSelectedNote(note);
  };

  if (pageLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-gray-500">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar />

      {/* Note List */}
      <div className="w-60 bg-white border-r flex flex-col">
        <div className="p-3 border-b">
          <button
            onClick={createNote}
            className="w-full flex items-center justify-center space-x-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 text-sm"
          >
            <Plus size={16} />
            <span>新建笔记</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {notes.map((note) => (
            <button
              key={note.id}
              onClick={() => setSelectedNote(note)}
              className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 text-sm ${
                selectedNote?.id === note.id ? 'bg-blue-50 border-blue-200' : ''
              }`}
            >
              <h3 className="font-medium truncate">{note.title}</h3>
              <p className="text-xs text-gray-500 truncate">
                {note.content.slice(0, 80) || 'No content'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <NoteEditor />
    </div>
  );
}
