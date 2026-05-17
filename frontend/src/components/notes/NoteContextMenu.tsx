'use client';

import { ReactNode } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Pencil, Trash2, FolderInput } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import type { Note } from '@/types';

interface Props {
  note: Note;
  children: ReactNode;
}

export default function NoteContextMenu({ note, children }: Props) {
  const setRenamingItem = useAppStore((s) => s.setRenamingItem);
  const setMovingNoteId = useAppStore((s) => s.setMovingNoteId);
  const setPendingDelete = useAppStore((s) => s.setPendingDelete);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[180px] bg-white rounded-lg shadow-lg border border-gray-200 p-1 z-50"
        >
          <ContextMenu.Item
            onSelect={() => setRenamingItem({ type: 'note', id: note.id })}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 rounded cursor-pointer outline-none data-[highlighted]:bg-gray-100"
          >
            <Pencil size={14} />
            重命名
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={() => setMovingNoteId(note.id)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 rounded cursor-pointer outline-none data-[highlighted]:bg-gray-100"
          >
            <FolderInput size={14} />
            移动到…
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px bg-gray-200 my-1" />
          <ContextMenu.Item
            onSelect={() => setPendingDelete({ type: 'note', id: note.id, name: note.title })}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 rounded cursor-pointer outline-none data-[highlighted]:bg-red-50"
          >
            <Trash2 size={14} />
            删除
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
