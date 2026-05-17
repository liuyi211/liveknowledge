'use client';

import { useMemo, useState, DragEvent } from 'react';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';
import { FolderRow, NoteRow } from './TreeNode';
import type { Folder, Note } from '@/types';

export default function NoteTree() {
  const folders = useAppStore((s) => s.folders);
  const setFolders = useAppStore((s) => s.setFolders);
  const notes = useAppStore((s) => s.notes);
  const setNotes = useAppStore((s) => s.setNotes);
  const selectedNote = useAppStore((s) => s.selectedNote);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const dragData = useAppStore((s) => s.dragData);
  const setDragData = useAppStore((s) => s.setDragData);
  const [isRootDropTarget, setIsRootDropTarget] = useState(false);

  const isSearching = searchQuery.trim().length > 0;

  const { rootFolders, rootNotes, folderChildrenMap, noteChildrenMap } = useMemo(() => {
    const folderChildren = new Map<string | null, Folder[]>();
    const noteChildren = new Map<string | null, Note[]>();

    for (const f of folders) {
      const key = f.parentId;
      if (!folderChildren.has(key)) folderChildren.set(key, []);
      folderChildren.get(key)!.push(f);
    }
    for (const arr of folderChildren.values()) arr.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    for (const n of notes) {
      const key = n.folderId;
      if (!noteChildren.has(key)) noteChildren.set(key, []);
      noteChildren.get(key)!.push(n);
    }
    for (const arr of noteChildren.values()) arr.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));

    return {
      rootFolders: folderChildren.get(null) ?? [],
      rootNotes: noteChildren.get(null) ?? [],
      folderChildrenMap: folderChildren,
      noteChildrenMap: noteChildren,
    };
  }, [folders, notes]);

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = searchQuery.trim().toLowerCase();
    return notes.filter((n) =>
      n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
    );
  }, [isSearching, searchQuery, notes]);

  const handleRootDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!dragData) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsRootDropTarget(true);
  };

  const handleRootDragLeave = (e: DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setIsRootDropTarget(false);
  };

  const handleRootDrop = async (e: DragEvent<HTMLDivElement>) => {
    if (!dragData) return;
    e.preventDefault();
    setIsRootDropTarget(false);
    try {
      if (dragData.type === 'note') {
        const note = notes.find((n) => n.id === dragData.id);
        if (!note || note.folderId === null) return;
        const updated = await api.notes.update(dragData.id, { folderId: null });
        setNotes(notes.map((n) => (n.id === updated.id ? updated : n)));
        if (selectedNote?.id === updated.id) setSelectedNote(updated);
      } else if (dragData.type === 'folder') {
        const f = folders.find((x) => x.id === dragData.id);
        if (!f || f.parentId === null) return;
        const updated = await api.folders.update(dragData.id, { parentId: null });
        setFolders(folders.map((x) => (x.id === updated.id ? updated : x)));
      }
    } catch (err) {
      console.error('Move to root failed:', err);
      alert((err as Error).message || '移动到根目录失败');
    } finally {
      setDragData(null);
    }
  };

  if (isSearching) {
    return (
      <div className="px-1 py-2">
        {searchResults.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">没有匹配的笔记</div>
        ) : (
          <>
            <div className="px-3 py-1 text-xs text-gray-400">{searchResults.length} 条结果</div>
            {searchResults.map((note) => (
              <NoteRow key={note.id} note={note} depth={0} highlight={searchQuery.trim()} />
            ))}
          </>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={handleRootDrop}
      className={`min-h-full px-1 py-2 ${isRootDropTarget && dragData ? 'bg-blue-50/50' : ''}`}
    >
      {rootFolders.length === 0 && rootNotes.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-12 px-4">
          还没有任何笔记。
          <br />
          点上方按钮新建一个，或在空白处右键也行。
        </div>
      ) : (
        <>
          {rootFolders.map((folder) => {
            const childFolders = folderChildrenMap.get(folder.id) ?? [];
            const childNotes = noteChildrenMap.get(folder.id) ?? [];
            return (
              <FolderRow
                key={folder.id}
                folder={folder}
                depth={0}
                childFolders={childFolders}
                childNotes={childNotes}
                folderChildrenMap={folderChildrenMap}
                noteChildrenMap={noteChildrenMap}
              />
            );
          })}
          {rootNotes.map((note) => (
            <NoteRow key={note.id} note={note} depth={0} />
          ))}
        </>
      )}
    </div>
  );
}
