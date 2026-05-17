'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';
import { Eye, Pencil, Check, Loader2, Database } from 'lucide-react';
import MarkdownPreview from './MarkdownPreview';

type SaveState = 'idle' | 'saving' | 'saved';

export default function NoteEditor() {
  const selectedNote = useAppStore((s) => s.selectedNote);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);
  const notes = useAppStore((s) => s.notes);
  const setNotes = useAppStore((s) => s.setNotes);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [indexStatus, setIndexStatus] = useState<any>(null);
  const lastSavedRef = useRef<{ title: string; content: string } | null>(null);

  useEffect(() => {
    if (selectedNote) {
      setTitle(selectedNote.title);
      setContent(selectedNote.content);
      lastSavedRef.current = { title: selectedNote.title, content: selectedNote.content };
      setSaveState('idle');
      // Load index status
      api.notes.indexStatus(selectedNote.id).then(setIndexStatus).catch(() => setIndexStatus(null));
    } else {
      lastSavedRef.current = null;
      setIndexStatus(null);
    }
  }, [selectedNote?.id]);

  const handleIndex = useCallback(async () => {
    if (!selectedNote) return;
    setIndexStatus({ indexStatus: 'chunking' });
    try {
      await api.notes.index(selectedNote.id);
      // Poll for status
      const interval = setInterval(async () => {
        try {
          const status = await api.notes.indexStatus(selectedNote.id);
          setIndexStatus(status);
          if (['done', 'failed'].includes(status.indexStatus)) {
            clearInterval(interval);
          }
        } catch {
          clearInterval(interval);
        }
      }, 1500);
    } catch {
      setIndexStatus({ indexStatus: 'failed' });
    }
  }, [selectedNote?.id]);

  // 同步外部对当前笔记的修改（如树中重命名）
  useEffect(() => {
    if (!selectedNote || !lastSavedRef.current) return;
    const last = lastSavedRef.current;
    if (last.title !== selectedNote.title || last.content !== selectedNote.content) {
      setTitle(selectedNote.title);
      setContent(selectedNote.content);
      lastSavedRef.current = { title: selectedNote.title, content: selectedNote.content };
    }
  }, [selectedNote?.title, selectedNote?.content]);

  useEffect(() => {
    if (!selectedNote) return;
    const last = lastSavedRef.current;
    if (last && last.title === title && last.content === content) {
      return;
    }
    setSaveState('saving');
    const timeout = setTimeout(async () => {
      try {
        const updated = await api.notes.update(selectedNote.id, { title, content });
        lastSavedRef.current = { title: updated.title, content: updated.content };
        setSelectedNote(updated);
        setNotes(notes.map((n) => (n.id === updated.id ? updated : n)));
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 1200);
      } catch {
        setSaveState('idle');
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [title, content, selectedNote?.id]);

  if (!selectedNote) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center text-gray-400">
          <p className="text-lg">没有打开的笔记</p>
          <p className="text-sm mt-2">从左侧选择一条笔记，或在文件夹上右键新建</p>
        </div>
      </div>
    );
  }

  const mode = viewMode[selectedNote.id] ?? 'edit';

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-2 border-b bg-white">
        <div className="flex items-center gap-2 text-xs text-gray-500 min-w-0">
          {saveState === 'saving' && <><Loader2 size={12} className="animate-spin" /><span>保存中…</span></>}
          {saveState === 'saved' && <><Check size={12} className="text-green-600" /><span>已保存</span></>}
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode(selectedNote.id, 'edit')}
            className={`flex items-center gap-1 px-3 py-1 text-sm rounded-md transition ${
              mode === 'edit' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Pencil size={14} />
            编辑
          </button>
          <button
            onClick={() => setViewMode(selectedNote.id, 'preview')}
            className={`flex items-center gap-1 px-3 py-1 text-sm rounded-md transition ${
              mode === 'preview' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Eye size={14} />
            预览
          </button>
        </div>
        <button
          onClick={handleIndex}
          disabled={['chunking', 'embedding', 'storing'].includes(indexStatus?.indexStatus)}
          className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition ml-2 ${
            indexStatus?.indexStatus === 'done'
              ? 'bg-green-50 text-green-700 hover:bg-green-100'
              : ['chunking', 'embedding', 'storing'].includes(indexStatus?.indexStatus)
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}
          title="建立知识库索引，使笔记内容可被检索"
        >
          <Database size={12} />
          {indexStatus?.indexStatus === 'done' ? '已索引' :
           ['chunking', 'embedding', 'storing'].includes(indexStatus?.indexStatus) ? '索引中...' :
           '建立索引'}
        </button>
      </div>

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => {
          const v = e.target.value;
          if (v.length > 100) return;
          if (/[\/\\<>:"|?*]/.test(v)) return;
          setTitle(v);
        }}
        className="px-12 pt-8 pb-2 text-3xl font-bold focus:outline-none bg-white placeholder-gray-300"
        placeholder="无标题"
      />

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {mode === 'edit' ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full px-12 py-4 resize-none focus:outline-none font-mono text-sm leading-7 bg-white"
            placeholder="在这里写 Markdown… 支持 LaTeX 公式（$E=mc^2$）、代码块、表格、任务列表"
          />
        ) : (
          <div className="px-12 py-4">
            <MarkdownPreview content={content} />
          </div>
        )}
      </div>
    </div>
  );
}
