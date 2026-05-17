'use client';

import { useEffect } from 'react';
import { Plus, MessageSquare, Settings, FileText, Cog } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const sessions = useAppStore((s) => s.sessions);
  const setSessions = useAppStore((s) => s.setSessions);
  const currentSession = useAppStore((s) => s.currentSession);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const setMessages = useAppStore((s) => s.setMessages);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);

  useEffect(() => {
    api.auth.me().catch(() => router.push('/login'));
    api.sessions.list().then(setSessions);
  }, [router, setSessions]);

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

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-64 bg-gray-900 text-white flex flex-col">
          <div className="p-4">
            <button
              onClick={createSession}
              className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 py-2 rounded-lg"
            >
              <Plus size={18} />
              <span>New Chat</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => selectSession(session)}
                className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-left mb-1 ${
                  currentSession?.id === session.id
                    ? 'bg-gray-700'
                    : 'hover:bg-gray-800'
                }`}
              >
                <MessageSquare size={16} />
                <span className="truncate">{session.title}</span>
              </button>
            ))}
          </div>

          <div className="p-4 border-t border-gray-800 space-y-2">
            <Link
              href="/notes"
              className="flex items-center space-x-2 text-gray-300 hover:text-white"
            >
              <FileText size={16} />
              <span>Notes</span>
            </Link>
            <Link
              href="/settings"
              className="flex items-center space-x-2 text-gray-300 hover:text-white"
            >
              <Cog size={16} />
              <span>设置</span>
            </Link>
            <div className="flex items-center space-x-2">
              <Settings size={16} />
              <span className="text-sm">{user?.username || 'User'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
