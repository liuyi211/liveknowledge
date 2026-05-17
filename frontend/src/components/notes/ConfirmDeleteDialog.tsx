'use client';

import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';

export default function ConfirmDeleteDialog() {
  const pendingDelete = useAppStore((s) => s.pendingDelete);
  const setPendingDelete = useAppStore((s) => s.setPendingDelete);
  const notes = useAppStore((s) => s.notes);
  const setNotes = useAppStore((s) => s.setNotes);
  const folders = useAppStore((s) => s.folders);
  const setFolders = useAppStore((s) => s.setFolders);
  const selectedNote = useAppStore((s) => s.selectedNote);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);
  const [busy, setBusy] = useState(false);

  const descendantInfo = useMemo(() => {
    if (!pendingDelete || pendingDelete.type !== 'folder') return null;
    const folderIds = new Set<string>();
    const queue = [pendingDelete.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const f of folders) {
        if (f.parentId === current && !folderIds.has(f.id)) {
          folderIds.add(f.id);
          queue.push(f.id);
        }
      }
    }
    const allFolderIds = new Set([pendingDelete.id, ...folderIds]);
    const noteIds = new Set<string>();
    for (const n of notes) {
      if (n.folderId && allFolderIds.has(n.folderId)) noteIds.add(n.id);
    }
    return { folderIds, noteIds };
  }, [pendingDelete, folders, notes]);

  const close = () => {
    if (busy) return;
    setPendingDelete(null);
  };

  const handleConfirm = async () => {
    if (!pendingDelete || busy) return;
    setBusy(true);
    try {
      if (pendingDelete.type === 'note') {
        await api.notes.delete(pendingDelete.id);
        setNotes(notes.filter((n) => n.id !== pendingDelete.id));
        if (selectedNote?.id === pendingDelete.id) setSelectedNote(null);
      } else {
        await api.folders.delete(pendingDelete.id);
        const folderIds = descendantInfo?.folderIds ?? new Set<string>();
        const noteIds = descendantInfo?.noteIds ?? new Set<string>();
        setFolders(folders.filter((f) => f.id !== pendingDelete.id && !folderIds.has(f.id)));
        setNotes(notes.filter((n) => !noteIds.has(n.id)));
        if (selectedNote && noteIds.has(selectedNote.id)) setSelectedNote(null);
      }
      setPendingDelete(null);
    } catch (err) {
      alert((err as Error).message || '删除失败');
    } finally {
      setBusy(false);
    }
  };

  if (!pendingDelete) return null;

  const isFolder = pendingDelete.type === 'folder';
  const folderEmpty = isFolder && descendantInfo && descendantInfo.folderIds.size === 0 && descendantInfo.noteIds.size === 0;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/20 z-50" />
        <Dialog.Content
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
          }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[380px] z-50 outline-none"
        >
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <Dialog.Title className="font-semibold text-gray-900">
                  {isFolder ? '删除文件夹' : '删除笔记'}
                </Dialog.Title>
                <Dialog.Description className="mt-1.5 text-sm text-gray-600">
                  {isFolder ? (
                    folderEmpty ? (
                      <>确定删除空文件夹「<span className="font-medium text-gray-900">{pendingDelete.name}</span>」？</>
                    ) : (
                      <>
                        确定删除文件夹「<span className="font-medium text-gray-900">{pendingDelete.name}</span>」？
                        将级联删除 <span className="font-medium text-red-600">{descendantInfo!.folderIds.size}</span> 个子文件夹和 <span className="font-medium text-red-600">{descendantInfo!.noteIds.size}</span> 条笔记。
                      </>
                    )
                  ) : (
                    <>确定删除笔记「<span className="font-medium text-gray-900">{pendingDelete.name}</span>」？</>
                  )}
                  <br />
                  <span className="text-gray-400">此操作不可撤销。</span>
                </Dialog.Description>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 bg-gray-50 border-t rounded-b-lg">
            <button
              onClick={close}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-white disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={busy}
              autoFocus
              className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? '删除中…' : '删除'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
