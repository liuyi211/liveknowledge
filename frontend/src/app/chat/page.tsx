'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, MessageSquare } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import MessageList from '@/components/chat/MessageList';
import MessageInput from '@/components/chat/MessageInput';

export default function ChatPage() {
  const router = useRouter();
  const [pageLoading, setPageLoading] = useState(true);

  const user = useAppStore((s) => s.user);
  const sessions = useAppStore((s) => s.sessions);
  const setSessions = useAppStore((s) => s.setSessions);
  const currentSession = useAppStore((s) => s.currentSession);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const setMessages = useAppStore((s) => s.setMessages);
  const setUser = useAppStore((s) => s.setUser);

  useEffect(() => {
    api.auth.me()
      .then((u) => {
        setUser(u);
        setPageLoading(false);
      })
      .catch(() => router.push('/login'));
    api.sessions.list().then(setSessions);
  }, [router, setSessions, setUser]);

  const createSession = async () => {
    const session = await api.sessions.create({ title: 'New Chat' });
    setSessions([session, ...sessions]);
    setCurrentSession(session);
    setMessages([]);
  };

  const selectSession = async (session: { id: string; title: string; personaId: string | null; modelId: string | null; createdAt: string; updatedAt: string }) => {
    setCurrentSession(session);
    const data = await api.sessions.get(session.id);
    setMessages(data.messages || []);
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
      {/* Global Sidebar */}
      <Sidebar />

      {/* Session List */}
      <div className="w-60 bg-gray-800 text-white flex flex-col border-r border-gray-700">
        <div className="p-3">
          <button
            onClick={createSession}
            className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 py-2 rounded-lg text-sm"
          >
            <Plus size={16} />
            <span>新对话</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => selectSession(session)}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-left mb-1 text-sm ${
                currentSession?.id === session.id
                  ? 'bg-gray-700'
                  : 'hover:bg-gray-700/50'
              }`}
            >
              <MessageSquare size={14} />
              <span className="truncate">{session.title}</span>
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-gray-700">
          <div className="text-xs text-gray-400 truncate">{user?.username || 'User'}</div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-white">
        <MessageList />
        <MessageInput />
      </div>
    </div>
  );
}
