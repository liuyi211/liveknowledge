'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';

export default function NoteEditor() {
  const selectedNote = useAppStore((s) => s.selectedNote);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);
  const notes = useAppStore((s) => s.notes);
  const setNotes = useAppStore((s) => s.setNotes);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (selectedNote) {
      setTitle(selectedNote.title);
      setContent(selectedNote.content);
    }
  }, [selectedNote?.id]);

  const saveNote = async () => {
    if (!selectedNote) return;
    const updated = await api.notes.update(selectedNote.id, { title, content });
    setSelectedNote(updated);
    setNotes(notes.map((n) => (n.id === updated.id ? updated : n)));
  };

  useEffect(() => {
    const timeout = setTimeout(saveNote, 1000);
    return () => clearTimeout(timeout);
  }, [title, content]);

  if (!selectedNote) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Select a note or create a new one
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="px-6 py-4 text-xl font-bold border-b focus:outline-none"
        placeholder="Note title"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="flex-1 px-6 py-4 resize-none focus:outline-none font-mono text-sm"
        placeholder="Write in Markdown..."
      />
    </div>
  );
}
