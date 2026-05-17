'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SquarePen, FolderPlus, Search, ChevronsDownUp } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import SearchBox from '@/components/notes/SearchBox';
import NoteTree from '@/components/notes/NoteTree';
import NoteEditor from '@/components/notes/NoteEditor';
import MoveToFolderDialog from '@/components/notes/MoveToFolderDialog';
import ConfirmDeleteDialog from '@/components/notes/ConfirmDeleteDialog';
import IconButton from '@/components/notes/IconButton';

export default function NotesPage() {
  const router = useRouter();
  const [pageLoading, setPageLoading] = useState(true);
  const [searchActive, setSearchActive] = useState(false);

  const setNotes = useAppStore((s) => s.setNotes);
  const notes = useAppStore((s) => s.notes);
  const setFolders = useAppStore((s) => s.setFolders);
  const folders = useAppStore((s) => s.folders);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);
  const setRenamingItem = useAppStore((s) => s.setRenamingItem);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const collapseAllFolders = useAppStore((s) => s.collapseAllFolders);

  useEffect(() => {
    api.auth.me()
      .then(() => setPageLoading(false))
      .catch(() => router.push('/login'));
    Promise.all([
      api.notes.list(),
      api.folders.list(),
    ]).then(([notesData, foldersData]) => {
      setNotes(notesData);
      setFolders(foldersData);
    });
    return () => {
      setSearchQuery('');
    };
  }, [router, setNotes, setFolders, setSearchQuery]);

  const createRootNote = async () => {
    const created = await api.notes.create({ title: '无标题', content: '', folderId: null });
    setNotes([created, ...notes]);
    setSelectedNote(created);
    setRenamingItem({ type: 'note', id: created.id });
  };

  const createRootFolder = async () => {
    const created = await api.folders.create({ name: '新建文件夹', parentId: null });
    setFolders([...folders, created]);
    setRenamingItem({ type: 'folder', id: created.id });
  };

  const toggleSearch = () => {
    if (searchActive) {
      setSearchQuery('');
      setSearchActive(false);
    } else {
      setSearchActive(true);
    }
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

      <div className="w-72 bg-white border-r flex flex-col">
        <div className="px-2 py-1.5 border-b flex items-center gap-1">
          <IconButton tooltip="新建笔记" onClick={createRootNote}>
            <SquarePen size={16} />
          </IconButton>
          <IconButton tooltip="新建文件夹" onClick={createRootFolder}>
            <FolderPlus size={16} />
          </IconButton>
          <IconButton tooltip="搜索" onClick={toggleSearch} active={searchActive}>
            <Search size={16} />
          </IconButton>
          <IconButton tooltip="全部折叠" onClick={collapseAllFolders}>
            <ChevronsDownUp size={16} />
          </IconButton>
        </div>
        {searchActive && (
          <div className="px-2 py-2 border-b">
            <SearchBox autoFocus />
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          <NoteTree />
        </div>
      </div>

      <NoteEditor />
      <MoveToFolderDialog />
      <ConfirmDeleteDialog />
    </div>
  );
}
