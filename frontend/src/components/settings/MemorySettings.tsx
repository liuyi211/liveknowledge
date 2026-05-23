'use client';

import { useEffect, useState } from 'react';
import { Archive, BrainCircuit, RefreshCw, Save, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { ConversationMemory, ConversationMemoryStatus, ConversationMemoryType } from '@/types';

const memoryTypes: Array<{ value: ConversationMemoryType | ''; label: string }> = [
  { value: '', label: '全部类型' },
  { value: 'preference', label: '偏好' },
  { value: 'goal', label: '目标' },
  { value: 'fact', label: '事实' },
  { value: 'decision', label: '决策' },
  { value: 'open_question', label: '待跟进' },
  { value: 'concept', label: '概念' },
  { value: 'correction', label: '纠正' },
];

const statuses: Array<{ value: ConversationMemoryStatus; label: string }> = [
  { value: 'active', label: '启用' },
  { value: 'archived', label: '归档' },
  { value: 'rejected', label: '已拒绝' },
];

export default function MemorySettings() {
  const [memories, setMemories] = useState<ConversationMemory[]>([]);
  const [status, setStatus] = useState<ConversationMemoryStatus>('active');
  const [type, setType] = useState<ConversationMemoryType | ''>('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadMemories() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.memories.list({ status, type: type || undefined, limit: 100 });
      setMemories(result as ConversationMemory[]);
    } catch (err) {
      setError((err as Error).message || '加载记忆失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMemories();
  }, [status, type]);

  async function updateMemory(memory: ConversationMemory, patch: Partial<ConversationMemory>) {
    setSavingId(memory.id);
    setError(null);
    try {
      const updated = await api.memories.update(memory.id, patch);
      setMemories(items => items.map(item => item.id === memory.id ? updated as ConversationMemory : item));
    } catch (err) {
      setError((err as Error).message || '保存记忆失败');
    } finally {
      setSavingId(null);
    }
  }

  async function archiveMemory(id: string) {
    setSavingId(id);
    setError(null);
    try {
      await api.memories.archive(id);
      setMemories(items => items.filter(item => item.id !== id));
    } catch (err) {
      setError((err as Error).message || '归档记忆失败');
    } finally {
      setSavingId(null);
    }
  }

  async function rejectMemory(id: string) {
    setSavingId(id);
    setError(null);
    try {
      await api.memories.reject(id);
      setMemories(items => items.filter(item => item.id !== id));
    } catch (err) {
      setError((err as Error).message || '拒绝记忆失败');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BrainCircuit size={20} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">记忆管理</h2>
        </div>
        <button
          type="button"
          onClick={loadMemories}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <select
          value={status}
          onChange={event => setStatus(event.target.value as ConversationMemoryStatus)}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm"
        >
          {statuses.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select
          value={type}
          onChange={event => setType(event.target.value as ConversationMemoryType | '')}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm"
        >
          {memoryTypes.map(item => <option key={item.value || 'all'} value={item.value}>{item.label}</option>)}
        </select>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="rounded-md bg-gray-50 px-3 py-4 text-sm text-gray-500">加载中...</div>
      ) : memories.length === 0 ? (
        <div className="rounded-md bg-gray-50 px-3 py-4 text-sm text-gray-500">当前筛选下没有记忆。</div>
      ) : (
        <div className="space-y-3">
          {memories.map(memory => (
            <MemoryItem
              key={memory.id}
              memory={memory}
              saving={savingId === memory.id}
              onSave={patch => updateMemory(memory, patch)}
              onArchive={() => archiveMemory(memory.id)}
              onReject={() => rejectMemory(memory.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MemoryItem({
  memory,
  saving,
  onSave,
  onArchive,
  onReject,
}: {
  memory: ConversationMemory;
  saving: boolean;
  onSave: (patch: Partial<ConversationMemory>) => void;
  onArchive: () => void;
  onReject: () => void;
}) {
  const [content, setContent] = useState(memory.content);
  const [type, setType] = useState<ConversationMemoryType>(memory.type);
  const changed = content !== memory.content || type !== memory.type;

  useEffect(() => {
    setContent(memory.content);
    setType(memory.type);
  }, [memory.id, memory.content, memory.type]);

  return (
    <article className="rounded-md border border-gray-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <select
          value={type}
          onChange={event => setType(event.target.value as ConversationMemoryType)}
          className="rounded-md border border-gray-200 px-2 py-1 text-xs"
        >
          {memoryTypes.filter(item => item.value).map(item => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>重要度 {Math.round(memory.importance * 100)}%</span>
          <span>置信度 {Math.round(memory.confidence * 100)}%</span>
          <span>{formatDate(memory.updatedAt)}</span>
        </div>
      </div>

      <textarea
        value={content}
        onChange={event => setContent(event.target.value)}
        className="min-h-[88px] w-full resize-y rounded-md border border-gray-200 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-300"
      />

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onSave({ content, type })}
          disabled={!changed || saving || !content.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={14} />
          保存
        </button>
        <button
          type="button"
          onClick={onArchive}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Archive size={14} />
          归档
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          <XCircle size={14} />
          拒绝
        </button>
      </div>
    </article>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
