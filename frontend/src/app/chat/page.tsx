'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { useChatStore } from '@/stores/chat-store';
import { api } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import SessionSidebar from '@/components/chat/SessionSidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import MessageList from '@/components/chat/MessageList';
import MessageInput from '@/components/chat/MessageInput';

export default function ChatPage() {
  const router = useRouter();
  const [pageLoading, setPageLoading] = useState(true);

  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const currentSession = useChatStore((s) => s.currentSession);
  const loadSessions = useChatStore((s) => s.loadSessions);

  useEffect(() => {
    api.auth.me()
      .then((u) => {
        setUser(u);
        setPageLoading(false);
      })
      .catch(() => router.push('/login'));
    loadSessions();
  }, [router, setUser, loadSessions]);

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
    <div className="flex h-screen bg-white">
      {/* Global Navigation Sidebar */}
      <Sidebar />

      {/* Session List Sidebar */}
      <SessionSidebar />

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader />
        {currentSession ? (
          <>
            <MessageList />
            <MessageInput />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
            </div>
            <p className="text-lg font-medium text-gray-500">开始新对话</p>
            <p className="text-sm mt-1">从左侧选择一个对话，或点击「新对话」开始</p>
          </div>
        )}
      </div>
    </div>
  );
}
