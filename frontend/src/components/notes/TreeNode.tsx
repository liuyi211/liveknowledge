'use client';

import { useState, useEffect, useRef, KeyboardEvent, DragEvent } from 'react';
import { ChevronRight, ChevronDown, Folder as FolderIcon, FolderOpen, FileText } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';
import type { Folder, Note } from '@/types';
import NoteContextMenu from './NoteContextMenu';
import FolderContextMenu from './FolderContextMenu';

function collectFolderDescendantsInclSelf(rootId: string, folders: Folder[]): Set<string> {
  const result = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const f of folders) {
      if (f.parentId === current && !result.has(f.id)) {
        result.add(f.id);
        queue.push(f.id);
      }
    }
  }
  return result;
}

interface FolderRowProps {
  folder: Folder;
  depth: number;
  childFolders: Folder[];
  childNotes: Note[];
  folderChildrenMap: Map<string | null, Folder[]>;
  noteChildrenMap: Map<string | null, Note[]>;
}

export function FolderRow({ folder, depth, childFolders, childNotes, folderChildrenMap, noteChildrenMap }: FolderRowProps) {
  const expandedFolderIds = useAppStore((s) => s.expandedFolderIds);
  const toggleFolderExpanded = useAppStore((s) => s.toggleFolderExpanded);
  const expandFolder = useAppStore((s) => s.expandFolder);
  const renamingItem = useAppStore((s) => s.renamingItem);
  const setRenamingItem = useAppStore((s) => s.setRenamingItem);
  const folders = useAppStore((s) => s.folders);
  const setFolders = useAppStore((s) => s.setFolders);
  const notes = useAppStore((s) => s.notes);
  const setNotes = useAppStore((s) => s.setNotes);
  const selectedNote = useAppStore((s) => s.selectedNote);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);
  const dragData = useAppStore((s) => s.dragData);
  const setDragData = useAppStore((s) => s.setDragData);

  const expanded = expandedFolderIds.has(folder.id);
  const isRenaming = renamingItem?.type === 'folder' && renamingItem.id === folder.id;
  const [name, setName] = useState(folder.name);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setName(folder.name);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [isRenaming, folder.name]);

  const commitRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === folder.name) {
      setRenamingItem(null);
      return;
    }
    const updated = await api.folders.update(folder.id, { name: trimmed });
    setFolders(folders.map((f) => (f.id === updated.id ? updated : f)));
    setRenamingItem(null);
  };

  const cancelRename = () => {
    setName(folder.name);
    setRenamingItem(null);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitRename();
    else if (e.key === 'Escape') cancelRename();
  };

  const isForbidden = dragData?.forbiddenFolderIds.has(folder.id) ?? false;

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', folder.id);
    const forbidden = collectFolderDescendantsInclSelf(folder.id, folders);
    setDragData({ type: 'folder', id: folder.id, forbiddenFolderIds: forbidden });
  };

  const handleDragEnd = () => {
    setDragData(null);
    setIsDropTarget(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!dragData || isForbidden) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsDropTarget(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setIsDropTarget(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    if (!dragData || isForbidden) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(false);

    try {
      if (dragData.type === 'note') {
        const note = notes.find((n) => n.id === dragData.id);
        if (!note || note.folderId === folder.id) return;
        const updated = await api.notes.update(dragData.id, { folderId: folder.id });
        setNotes(notes.map((n) => (n.id === updated.id ? updated : n)));
        if (selectedNote?.id === updated.id) setSelectedNote(updated);
      } else if (dragData.type === 'folder') {
        const f = folders.find((x) => x.id === dragData.id);
        if (!f || f.parentId === folder.id) return;
        const updated = await api.folders.update(dragData.id, { parentId: folder.id });
        setFolders(folders.map((x) => (x.id === updated.id ? updated : x)));
      }
      expandFolder(folder.id);
    } catch (err) {
      console.error('Move failed:', err);
      alert((err as Error).message || '移动失败');
    } finally {
      setDragData(null);
    }
  };

  return (
    <div>
      <FolderContextMenu folder={folder}>
        <div
          draggable={!isRenaming}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`group flex items-center gap-1 px-2 py-1 rounded text-sm cursor-pointer select-none ${
            isDropTarget ? 'bg-blue-100 ring-1 ring-blue-300' : 'hover:bg-gray-100'
          } ${isForbidden ? 'opacity-50' : ''}`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => !isRenaming && toggleFolderExpanded(folder.id)}
        >
          {expanded ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
          {expanded ? <FolderOpen size={14} className="text-amber-500 shrink-0" /> : <FolderIcon size={14} className="text-amber-500 shrink-0" />}
          {isRenaming ? (
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleKey}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-white border border-blue-400 rounded px-1 text-sm outline-none"
            />
          ) : (
            <span className="truncate text-gray-700">{folder.name}</span>
          )}
        </div>
      </FolderContextMenu>

      {expanded && (
        <div>
          {childFolders.map((child) => {
            const grandChildFolders = folderChildrenMap.get(child.id) ?? [];
            const grandChildNotes = noteChildrenMap.get(child.id) ?? [];
            return (
              <FolderRow
                key={child.id}
                folder={child}
                depth={depth + 1}
                childFolders={grandChildFolders}
                childNotes={grandChildNotes}
                folderChildrenMap={folderChildrenMap}
                noteChildrenMap={noteChildrenMap}
              />
            );
          })}
          {childNotes.map((note) => (
            <NoteRow key={note.id} note={note} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface NoteRowProps {
  note: Note;
  depth: number;
  highlight?: string;
}

export function NoteRow({ note, depth, highlight }: NoteRowProps) {
  const selectedNote = useAppStore((s) => s.selectedNote);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);
  const renamingItem = useAppStore((s) => s.renamingItem);
  const setRenamingItem = useAppStore((s) => s.setRenamingItem);
  const notes = useAppStore((s) => s.notes);
  const setNotes = useAppStore((s) => s.setNotes);
  const setDragData = useAppStore((s) => s.setDragData);

  const isSelected = selectedNote?.id === note.id;
  const isRenaming = renamingItem?.type === 'note' && renamingItem.id === note.id;
  const [name, setName] = useState(note.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setName(note.title);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [isRenaming, note.title]);

  const commitRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === note.title) {
      setRenamingItem(null);
      return;
    }
    const updated = await api.notes.update(note.id, { title: trimmed });
    setNotes(notes.map((n) => (n.id === updated.id ? updated : n)));
    if (selectedNote?.id === note.id) setSelectedNote(updated);
    setRenamingItem(null);
  };

  const cancelRename = () => {
    setName(note.title);
    setRenamingItem(null);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitRename();
    else if (e.key === 'Escape') cancelRename();
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', note.id);
    setDragData({ type: 'note', id: note.id, forbiddenFolderIds: new Set() });
  };

  const handleDragEnd = () => {
    setDragData(null);
  };

  const renderTitle = () => {
    if (!highlight) return <span className="truncate">{note.title}</span>;
    const idx = note.title.toLowerCase().indexOf(highlight.toLowerCase());
    if (idx < 0) return <span className="truncate">{note.title}</span>;
    return (
      <span className="truncate">
        {note.title.slice(0, idx)}
        <mark className="bg-yellow-200 px-0.5 rounded">{note.title.slice(idx, idx + highlight.length)}</mark>
        {note.title.slice(idx + highlight.length)}
      </span>
    );
  };

  return (
    <NoteContextMenu note={note}>
      <div
        draggable={!isRenaming}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={`flex items-center gap-1 px-2 py-1 rounded text-sm cursor-pointer select-none ${
          isSelected ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-100 text-gray-700'
        }`}
        style={{ paddingLeft: `${depth * 12 + 22}px` }}
        onClick={() => !isRenaming && setSelectedNote(note)}
      >
        <FileText size={13} className="text-gray-400 shrink-0" />
        {isRenaming ? (
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKey}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-white border border-blue-400 rounded px-1 text-sm outline-none"
          />
        ) : (
          renderTitle()
        )}
      </div>
    </NoteContextMenu>
  );
}
