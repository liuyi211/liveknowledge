'use client';

import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';
import { Plus } from 'lucide-react';

export default function NoteList() {
  const notes = useAppStore((s) => s.notes);
  const setNotes = useAppStore((s) => s.setNotes);
  const selectedNote = useAppStore((s) => s.selectedNote);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);

  const createNote = async () => {
    const note = await api.notes.create({
      title: 'Untitled Note',
      content: '',
    });
    setNotes([note, ...notes]);
    setSelectedNote(note);
  };

  return (
    <div className="w-64 border-r bg-white flex flex-col">
      <div className="p-4 border-b">
        <button
          onClick={createNote}
          className="w-full flex items-center justify-center space-x-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={18} />
          <span>New Note</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {notes.map((note) => (
          <button
            key={note.id}
            onClick={() => setSelectedNote(note)}
            className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 ${
              selectedNote?.id === note.id ? 'bg-blue-50 border-blue-200' : ''
            }`}
          >
            <h3 className="font-medium truncate">{note.title}</h3>
            <p className="text-sm text-gray-500 truncate">
              {note.content.slice(0, 100) || 'No content'}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
