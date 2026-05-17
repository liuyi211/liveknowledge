'use client';

import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Folder as FolderIcon, Home, ChevronRight, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';
import type { Folder } from '@/types';

export default function MoveToFolderDialog() {
  const movingNoteId = useAppStore((s) => s.movingNoteId);
  const setMovingNoteId = useAppStore((s) => s.setMovingNoteId);
  const folders = useAppStore((s) => s.folders);
  const notes = useAppStore((s) => s.notes);
  const setNotes = useAppStore((s) => s.setNotes);
  const selectedNote = useAppStore((s) => s.selectedNote);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string | null>(null);

  const note = useMemo(
    () => notes.find((n) => n.id === movingNoteId) ?? null,
    [movingNoteId, notes],
  );

  const folderTree = useMemo(() => {
    const childrenOf = new Map<string | null, Folder[]>();
    for (const f of folders) {
      const key = f.parentId;
      if (!childrenOf.has(key)) childrenOf.set(key, []);
      childrenOf.get(key)!.push(f);
    }
    for (const arr of childrenOf.values()) arr.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    return childrenOf;
  }, [folders]);

  const close = () => {
    setMovingNoteId(null);
    setTarget(null);
    setExpanded(new Set());
  };

  const handleConfirm = async () => {
    if (!note) return;
    const folderId = target === 'root' ? null : target;
    const updated = await api.notes.update(note.id, { folderId });
    setNotes(notes.map((n) => (n.id === updated.id ? updated : n)));
    if (selectedNote?.id === note.id) setSelectedNote(updated);
    close();
  };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderFolder = (folder: Folder, depth: number): React.ReactNode => {
    const children = folderTree.get(folder.id) ?? [];
    const isExpanded = expanded.has(folder.id);
    const isSelected = target === folder.id;
    const isCurrent = note?.folderId === folder.id;
    return (
      <div key={folder.id}>
        <button
          onClick={() => setTarget(folder.id)}
          disabled={isCurrent}
          className={`w-full flex items-center gap-1 px-2 py-1.5 rounded text-sm text-left ${
            isSelected ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-100'
          } ${isCurrent ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {children.length > 0 ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggle(folder.id);
              }}
              className="inline-flex"
            >
              {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
            </span>
          ) : (
            <span className="w-3.5" />
          )}
          <FolderIcon size={14} className="text-amber-500" />
          <span className="truncate">{folder.name}</span>
          {isCurrent && <span className="ml-auto text-xs text-gray-400">当前位置</span>}
        </button>
        {isExpanded && children.map((child) => renderFolder(child, depth + 1))}
      </div>
    );
  };

  const rootFolders = folderTree.get(null) ?? [];
  const isAtRoot = note?.folderId === null;
  const canConfirm = note && target !== null && (target === 'root' ? !isAtRoot : note.folderId !== target);

  return (
    <Dialog.Root open={!!movingNoteId} onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[420px] max-h-[70vh] flex flex-col z-50">
          <div className="flex items-center justify-between p-4 border-b">
            <Dialog.Title className="font-semibold">移动笔记</Dialog.Title>
            <Dialog.Close className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="px-4 pt-2 text-sm text-gray-500">
            选择「{note?.title ?? ''}」要移动到的目标位置
          </Dialog.Description>
          <div className="flex-1 overflow-auto px-2 py-2 min-h-[200px]">
            <button
              onClick={() => setTarget('root')}
              disabled={isAtRoot}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-left ${
                target === 'root' ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-100'
              } ${isAtRoot ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <Home size={14} className="text-gray-500" />
              根目录
              {isAtRoot && <span className="ml-auto text-xs text-gray-400">当前位置</span>}
            </button>
            {rootFolders.map((folder) => renderFolder(folder, 0))}
          </div>
          <div className="flex justify-end gap-2 p-3 border-t">
            <button
              onClick={close}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              移动
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
