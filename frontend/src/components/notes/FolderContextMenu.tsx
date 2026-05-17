'use client';

import { ReactNode } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Pencil, Trash2, FolderPlus, FilePlus } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';
import type { Folder } from '@/types';

interface Props {
  folder: Folder;
  children: ReactNode;
}

export default function FolderContextMenu({ folder, children }: Props) {
  const folders = useAppStore((s) => s.folders);
  const setFolders = useAppStore((s) => s.setFolders);
  const notes = useAppStore((s) => s.notes);
  const setNotes = useAppStore((s) => s.setNotes);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);
  const setRenamingItem = useAppStore((s) => s.setRenamingItem);
  const setPendingDelete = useAppStore((s) => s.setPendingDelete);
  const expandFolder = useAppStore((s) => s.expandFolder);

  const handleNewFolder = async () => {
    const created = await api.folders.create({ name: '新建文件夹', parentId: folder.id });
    setFolders([...folders, created]);
    expandFolder(folder.id);
    setRenamingItem({ type: 'folder', id: created.id });
  };

  const handleNewNote = async () => {
    const created = await api.notes.create({
      title: '无标题',
      content: '',
      folderId: folder.id,
    });
    setNotes([created, ...notes]);
    expandFolder(folder.id);
    setSelectedNote(created);
    setRenamingItem({ type: 'note', id: created.id });
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[200px] bg-white rounded-lg shadow-lg border border-gray-200 p-1 z-50"
        >
          <ContextMenu.Item
            onSelect={handleNewNote}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 rounded cursor-pointer outline-none data-[highlighted]:bg-gray-100"
          >
            <FilePlus size={14} />
            在此处新建笔记
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={handleNewFolder}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 rounded cursor-pointer outline-none data-[highlighted]:bg-gray-100"
          >
            <FolderPlus size={14} />
            新建子文件夹
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px bg-gray-200 my-1" />
          <ContextMenu.Item
            onSelect={() => setRenamingItem({ type: 'folder', id: folder.id })}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 rounded cursor-pointer outline-none data-[highlighted]:bg-gray-100"
          >
            <Pencil size={14} />
            重命名
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={() => setPendingDelete({ type: 'folder', id: folder.id, name: folder.name })}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 rounded cursor-pointer outline-none data-[highlighted]:bg-red-50"
          >
            <Trash2 size={14} />
            删除文件夹
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
