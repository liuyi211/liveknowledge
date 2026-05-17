'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, MessageSquare, Search, Trash2, Edit3, Eraser, X } from 'lucide-react';
import { useChatStore } from '@/stores/chat-store';

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export default function SessionSidebar() {
  const sessions = useChatStore((s) => s.sessions);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const createSession = useChatStore((s) => s.createSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const renameSession = useChatStore((s) => s.renameSession);
  const clearSession = useChatStore((s) => s.clearSession);
  const currentSession = useChatStore((s) => s.currentSession);
  const setCurrentSession = useChatStore((s) => s.setCurrentSession);
  const loadSessionMessages = useChatStore((s) => s.loadSessionMessages);
  const searchQuery = useChatStore((s) => s.sessionsSearchQuery);
  const setSearchQuery = useChatStore((s) => s.setSessionsSearchQuery);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const filteredSessions = searchQuery
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.lastMessagePreview?.toLowerCase() || '').includes(searchQuery.toLowerCase())
      )
    : sessions;

  const handleSelectSession = async (session: typeof sessions[0]) => {
    setCurrentSession(session);
    await loadSessionMessages(session.id);
  };

  const handleCreateSession = async () => {
    await createSession();
  };

  const startRename = (session: typeof sessions[0], e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(session.id);
    setRenameValue(session.title);
  };

  const confirmRename = async () => {
    if (renamingId && renameValue.trim()) {
      await renameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId });
  };

  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-3 space-y-2">
        <button
          onClick={handleCreateSession}
          className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-300 hover:bg-gray-100 py-2 rounded-lg text-sm font-medium text-gray-700 transition-colors"
        >
          <Plus size={16} />
          <span>新对话</span>
        </button>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索对话..."
            className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {filteredSessions.map((session) => (
          <div
            key={session.id}
            onClick={() => handleSelectSession(session)}
            onContextMenu={(e) => handleContextMenu(e, session.id)}
            className={`group relative w-full text-left rounded-lg px-3 py-2 cursor-pointer transition-colors ${
              currentSession?.id === session.id
                ? 'bg-gray-200'
                : 'hover:bg-gray-100'
            }`}
          >
            {renamingId === session.id ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                onBlur={confirmRename}
                onClick={(e) => e.stopPropagation()}
                className="w-full text-sm px-1 py-0.5 border border-blue-400 rounded focus:outline-none"
              />
            ) : (
              <>
                <div className="flex items-center space-x-2">
                  <MessageSquare size={14} className="text-gray-400 shrink-0" />
                  <span className="text-sm font-medium text-gray-800 truncate flex-1">
                    {session.title}
                  </span>
                </div>
                {session.lastMessagePreview && (
                  <p className="text-xs text-gray-400 truncate mt-0.5 ml-5">
                    {session.lastMessagePreview}
                  </p>
                )}
                <span className="text-[10px] text-gray-400 ml-5">
                  {formatRelativeTime(session.updatedAt)}
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              const session = sessions.find((s) => s.id === contextMenu.sessionId);
              if (session) startRename(session, { stopPropagation: () => {} } as any);
              setContextMenu(null);
            }}
            className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            <Edit3 size={14} />
            <span>重命名</span>
          </button>
          <button
            onClick={() => {
              clearSession(contextMenu.sessionId);
              setContextMenu(null);
            }}
            className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            <Eraser size={14} />
            <span>清空对话</span>
          </button>
          <div className="border-t border-gray-200 my-1" />
          <button
            onClick={() => {
              deleteSession(contextMenu.sessionId);
              setContextMenu(null);
            }}
            className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 size={14} />
            <span>删除</span>
          </button>
        </div>
      )}
    </div>
  );
}
