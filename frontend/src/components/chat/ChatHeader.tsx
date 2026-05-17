'use client';

import { useState, useRef, useEffect } from 'react';
import { Edit3, Check, X } from 'lucide-react';
import { useChatStore } from '@/stores/chat-store';

export default function ChatHeader() {
  const currentSession = useChatStore((s) => s.currentSession);
  const renameSession = useChatStore((s) => s.renameSession);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
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

  const handleSave = async () => {
    if (currentSession && editValue.trim()) {
      await renameSession(currentSession.id, editValue.trim());
    }
    setIsEditing(false);
  };

  if (!currentSession) {
    return (
      <div className="h-12 border-b border-gray-200 flex items-center px-4 bg-white">
        <span className="text-sm text-gray-400">选择一个对话或创建新对话</span>
      </div>
    );
  }

  return (
    <div className="h-12 border-b border-gray-200 flex items-center justify-between px-4 bg-white">
      <div className="flex items-center space-x-2 flex-1 min-w-0">
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
              className="text-sm font-medium px-2 py-0.5 border border-blue-400 rounded focus:outline-none"
            />
            <button onClick={handleSave} className="text-green-600 hover:text-green-700">
              <Check size={16} />
            </button>
            <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2 group">
            <h2 className="text-sm font-medium text-gray-800 truncate">{currentSession.title}</h2>
            <button
              onClick={() => setIsEditing(true)}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity"
            >
              <Edit3 size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        {currentSession.modelId && (
          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
            {currentSession.modelId}
          </span>
        )}
      </div>
    </div>
  );
}
