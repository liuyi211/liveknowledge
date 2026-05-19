'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';
import { Eye, Pencil, Check, Loader2, Database, AlertTriangle, Link2, X } from 'lucide-react';
import MarkdownPreview from './MarkdownPreview';
import ExtractionButton from '../extraction/ExtractionButton';
import TaskProgressDrawer from '../progress/TaskProgressDrawer';
import { useTaskProgress } from '../progress/useTaskProgress';
import { INDEX_STEPS } from '../progress/types';

type SaveState = 'idle' | 'saving' | 'saved';

function normalizeTags(value: string): string[] {
  return Array.from(new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean)));
}

function formatSource(sourceType: string | null, sourceMetadata: Record<string, unknown> | null): string | null {
  if (!sourceType) return null;
  if (sourceType === 'extraction') {
    const original = sourceMetadata?.originalSourceType;
    if (original === 'conversation') return '来源：会话提炼';
    if (original === 'note') return '来源：笔记提炼';
    return '来源：知识提炼';
  }
  if (sourceType === 'conversation') return '来源：会话';
  if (sourceType === 'import') return '来源：导入';
  if (sourceType === 'document') return '来源：文档';
  return `来源：${sourceType}`;
}

export default function NoteEditor() {
  const selectedNote = useAppStore((s) => s.selectedNote);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);
  const notes = useAppStore((s) => s.notes);
  const setNotes = useAppStore((s) => s.setNotes);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagText, setTagText] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [indexStatus, setIndexStatus] = useState<any>(null);
  const [showIndexDrawer, setShowIndexDrawer] = useState(false);
  const lastSavedRef = useRef<{ title: string; content: string } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedNoteRef = useRef(selectedNote);
  const editStateRef = useRef({ title: '', content: '', tagText: '' });
  selectedNoteRef.current = selectedNote;
  editStateRef.current = { title, content, tagText };

  const refreshSelectedNote = useCallback(async () => {
    const note = selectedNoteRef.current;
    if (!note) return;
    const latest = await api.notes.get(note.id);
    setSelectedNote(latest);
    setNotes(useAppStore.getState().notes.map((n) => (n.id === latest.id ? latest : n)));
    setHasConflict(false);
    setSaveError(null);
  }, [setNotes, setSelectedNote]);

  const persistNoteSnapshot = useCallback(async (
    note = selectedNoteRef.current,
    editState = editStateRef.current,
    immediate = false
  ) => {
    if (!note || hasConflict) return;
    const isActiveNote = () => selectedNoteRef.current?.id === note.id;

    const tags = normalizeTags(editState.tagText);
    const last = lastSavedRef.current;
    const tagsChanged = JSON.stringify(tags) !== JSON.stringify(note.tags ?? []);
    if (isActiveNote() && last && last.title === editState.title && last.content === editState.content && !tagsChanged) {
      return;
    }

    if (!editState.title.trim()) {
      if (isActiveNote()) {
        setSaveError('标题不能为空');
      }
      return;
    }

    if (isActiveNote()) {
      setSaveState('saving');
      setSaveError(null);
    }

    try {
      const updated = await api.notes.update(note.id, {
        title: editState.title.trim(),
        content: editState.content,
        tags,
        version: note.version,
      });
      if (isActiveNote()) {
        lastSavedRef.current = { title: updated.title, content: updated.content };
        setSelectedNote(updated);
        setSaveState('saved');
        if (!immediate) {
          setTimeout(() => setSaveState('idle'), 1200);
        }
      }
      setNotes(useAppStore.getState().notes.map((n) => (n.id === updated.id ? updated : n)));
    } catch (err) {
      const apiError = err as Error & { status?: number; code?: string; data?: any };
      if (apiError.status === 409 && apiError.data?.current) {
        const latest = apiError.data.current;
        if (isActiveNote()) {
          setHasConflict(true);
          setSaveError('检测到笔记已被其他操作更新。已暂停自动保存，请刷新后继续编辑。');
          setSelectedNote(latest);
        }
        setNotes(useAppStore.getState().notes.map((n) => (n.id === latest.id ? latest : n)));
      } else if (isActiveNote()) {
        setSaveError(apiError.message || '保存失败');
      }
      if (isActiveNote()) {
        setSaveState('idle');
      }
    }
  }, [hasConflict, setNotes, setSelectedNote]);

  const persistCurrentNote = useCallback((immediate = false) => {
    return persistNoteSnapshot(selectedNoteRef.current, editStateRef.current, immediate);
  }, [persistNoteSnapshot]);

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
    const noteForCleanup = selectedNote;
    if (selectedNote) {
      setTitle(selectedNote.title);
      setContent(selectedNote.content);
      setTagText((selectedNote.tags ?? []).join(', '));
      lastSavedRef.current = { title: selectedNote.title, content: selectedNote.content };
      setSaveState('idle');
      setSaveError(null);
      setHasConflict(false);
      // Load index status
      api.notes.indexStatus(selectedNote.id).then(setIndexStatus).catch(() => setIndexStatus(null));
    } else {
      lastSavedRef.current = null;
      setIndexStatus(null);
    }
    // Stop any running progress polling when switching notes
    indexProgress.stopPolling();
    setShowIndexDrawer(false);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void persistNoteSnapshot(noteForCleanup, editStateRef.current, true);
    };
  }, [selectedNote?.id]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void persistCurrentNote(true);
    };
  }, [persistCurrentNote]);

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
      setTagText((selectedNote.tags ?? []).join(', '));
      lastSavedRef.current = { title: selectedNote.title, content: selectedNote.content };
    }
  }, [selectedNote?.title, selectedNote?.content, selectedNote?.tags]);

  useEffect(() => {
    if (!selectedNote) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const last = lastSavedRef.current;
    const tags = normalizeTags(tagText);
    const tagsChanged = JSON.stringify(tags) !== JSON.stringify(selectedNote.tags ?? []);
    if (last && last.title === title && last.content === content && !tagsChanged) {
      return;
    }
    setSaveState('saving');
    saveTimerRef.current = setTimeout(() => {
      void persistCurrentNote();
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [title, content, tagText, selectedNote?.id, selectedNote?.tags, persistCurrentNote]);

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
  const sourceLabel = formatSource(selectedNote.sourceType, selectedNote.sourceMetadata);

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
          {saveError && <><AlertTriangle size={12} className="text-amber-600" /><span className="text-amber-700 truncate">{saveError}</span></>}
          {sourceLabel && !saveError && <><Link2 size={12} /><span>{sourceLabel}</span></>}
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
      {hasConflict && (
        <div className="mx-8 mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center justify-between gap-3">
          <span>当前笔记出现版本冲突，自动保存已暂停。</span>
          <button
            type="button"
            onClick={() => void refreshSelectedNote()}
            className="rounded bg-amber-600 px-3 py-1 text-white hover:bg-amber-700"
          >
            刷新笔记
          </button>
        </div>
      )}

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

      <div className="px-12 py-2 border-b border-gray-100 flex items-center gap-2">
        <span className="text-xs text-gray-400 shrink-0">标签</span>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <input
            type="text"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            className="min-w-0 flex-1 text-sm focus:outline-none text-gray-700 placeholder-gray-300"
            placeholder="用英文逗号分隔，例如：数学, 线性代数"
          />
          {tagText && (
            <button
              type="button"
              onClick={() => setTagText('')}
              className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-gray-100 text-gray-400"
              title="清空标签"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

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
