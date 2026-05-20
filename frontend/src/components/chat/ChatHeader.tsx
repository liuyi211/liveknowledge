'use client';

import { useState, useRef, useEffect } from 'react';
import { Edit3, Check, X, UserRound } from 'lucide-react';
import { useChatStore } from '@/stores/chat-store';
import ExtractionButton from '../extraction/ExtractionButton';
import { api } from '@/lib/api';
import type { Persona } from '@/types';

export default function ChatHeader() {
  const currentSession = useChatStore((s) => s.currentSession);
  const renameSession = useChatStore((s) => s.renameSession);
  const updateSessionPersona = useChatStore((s) => s.updateSessionPersona);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaSaving, setPersonaSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (currentSession) {
      setEditValue(currentSession.title);
      setIsEditing(false);
    }
  }, [currentSession?.id]);

  useEffect(() => {
    api.personas.list()
      .then(setPersonas)
      .catch(() => setPersonas([]));
  }, []);

  const handleSave = async () => {
    if (currentSession && editValue.trim()) {
      await renameSession(currentSession.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const handlePersonaChange = async (personaId: string) => {
    if (!currentSession) return;
    setPersonaSaving(true);
    try {
      await updateSessionPersona(currentSession.id, personaId || null);
    } finally {
      setPersonaSaving(false);
    }
  };

  if (!currentSession) {
    return (
      <div className="flex h-12 items-center border-b border-gray-200 bg-white px-4">
        <span className="text-sm text-gray-400">选择一个对话或创建新对话</span>
      </div>
    );
  }

  return (
    <div className="flex h-12 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex min-w-0 flex-1 items-center space-x-2">
        {isEditing ? (
          <div className="flex items-center space-x-2">
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              onBlur={handleSave}
              className="rounded border border-blue-400 px-2 py-0.5 text-sm font-medium focus:outline-none"
            />
            <button onClick={handleSave} className="text-green-600 hover:text-green-700">
              <Check size={16} />
            </button>
            <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="group flex items-center space-x-2">
            <h2 className="truncate text-sm font-medium text-gray-800">{currentSession.title}</h2>
            <button
              onClick={() => setIsEditing(true)}
              className="text-gray-400 opacity-0 transition-opacity hover:text-gray-600 group-hover:opacity-100"
              title="重命名"
            >
              <Edit3 size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center space-x-2">
        <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-1">
          <UserRound size={13} className="text-gray-500" />
          <select
            value={currentSession.personaId || ''}
            onChange={(e) => handlePersonaChange(e.target.value)}
            disabled={personaSaving}
            className="max-w-[170px] bg-transparent text-xs text-gray-700 focus:outline-none disabled:opacity-60"
            title={currentSession.contextSummary ? `已携带上下文摘要：${currentSession.contextSummary}` : '选择对话角色'}
          >
            <option value="">通用助手</option>
            {personas.map((persona) => (
              <option key={persona.id} value={persona.id}>{persona.name}</option>
            ))}
          </select>
        </div>
        <ExtractionButton
          sourceType="conversation"
          sourceId={currentSession.id}
        />
        {currentSession.modelId && (
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
            {currentSession.modelId}
          </span>
        )}
      </div>
    </div>
  );
}
