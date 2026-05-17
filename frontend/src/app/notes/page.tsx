'use client';

import { useEffect } from 'react';
import NoteList from '@/components/notes/NoteList';
import NoteEditor from '@/components/notes/NoteEditor';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';

export default function NotesPage() {
  const setNotes = useAppStore((s) => s.setNotes);

  useEffect(() => {
    api.notes.list().then(setNotes);
  }, [setNotes]);

  return (
    <div className="flex h-screen">
      <NoteList />
      <NoteEditor />
    </div>
  );
}
