'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';
import { Eye, Pencil, Check, Loader2, Database } from 'lucide-react';
import MarkdownPreview from './MarkdownPreview';
import ExtractionButton from '../extraction/ExtractionButton';
import TaskProgressDrawer from '../progress/TaskProgressDrawer';
import { useTaskProgress } from '../progress/useTaskProgress';
import { INDEX_STEPS } from '../progress/types';

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
  const [showIndexDrawer, setShowIndexDrawer] = useState(false);
  const lastSavedRef = useRef<{ title: string; content: string } | null>(null);
  const selectedNoteRef = useRef(selectedNote);
  selectedNoteRef.current = selectedNote;

  // Index progress tracking
  const indexProgress = useTaskProgress(
    async () => {
      const note = selectedNoteRef.current;
      if (!note) throw new Error('No note selected');
      const data = await api.notes.indexStatus(note.id);
      return {
        status: data.indexStatus,
        logs: data.indexLogs,
        error: data.indexError,
      };
    },
    (status) => ['done', 'failed'].includes(status),
    {
      onComplete: () => {
        const note = selectedNoteRef.current;
        if (note) {
          api.notes.indexStatus(note.id).then(setIndexStatus);
        }
      },
    }
  );

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
    // Stop any running progress polling when switching notes
    indexProgress.stopPolling();
    setShowIndexDrawer(false);
  }, [selectedNote?.id]);

  const handleIndex = useCallback(async () => {
    if (!selectedNote) return;

    // If actively polling, just show the progress drawer
    if (indexProgress.isPolling) {
      setShowIndexDrawer(true);
      return;
    }

    // Start new indexing (even if DB state shows chunking/embedding/storing from a previous stuck run)
    setIndexStatus({ indexStatus: 'chunking' });
    try {
      await api.notes.index(selectedNote.id);
      setShowIndexDrawer(true);
      indexProgress.startPolling();
    } catch {
      setIndexStatus({ indexStatus: 'failed' });
    }
  }, [selectedNote?.id, indexProgress]);

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

  const indexButtonState = indexProgress.isPolling
    ? 'running'
    : indexStatus?.indexStatus === 'done'
    ? 'done'
    : indexStatus?.indexStatus === 'failed'
    ? 'failed'
    : 'idle';

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
          className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition ml-2 ${
            indexButtonState === 'done'
              ? 'bg-green-50 text-green-700 hover:bg-green-100'
              : indexButtonState === 'failed'
              ? 'bg-red-50 text-red-700 hover:bg-red-100'
              : indexButtonState === 'running'
              ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}
          title={indexButtonState === 'running' ? '点击查看索引进度' : '建立知识库索引，使笔记内容可被检索'}
        >
          <Database size={12} />
          {indexButtonState === 'done' ? '已索引' :
           indexButtonState === 'failed' ? '索引失败' :
           indexButtonState === 'running' ? '索引中...' :
           '建立索引'}
        </button>
        <ExtractionButton
          sourceType="note"
          sourceId={selectedNote.id}
        />
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

      {/* Index Progress Drawer */}
      <TaskProgressDrawer
        isOpen={showIndexDrawer}
        onClose={() => setShowIndexDrawer(false)}
        title="建立索引"
        subtitle={selectedNote.title}
        icon="index"
        steps={INDEX_STEPS}
        status={indexProgress.state.status}
        logs={indexProgress.state.logs}
        error={indexProgress.state.error}
        overallStatus={indexProgress.state.overallStatus}
      />
    </div>
  );
}
