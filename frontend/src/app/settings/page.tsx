'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProviderForm from '@/components/settings/ProviderForm';
import RetrievalSettings from '@/components/settings/RetrievalSettings';
import PersonaSettings from '@/components/settings/PersonaSettings';
import { api } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import { Bot, Brain, Database } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'providers' | 'personas' | 'retrieval'>('providers');

  useEffect(() => {
    api.auth.me()
      .then(() => setLoading(false))
      .catch(() => router.push('/login'));
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center bg-gray-50">
          <div className="text-gray-500">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <h1 className="mb-8 text-2xl font-bold">设置</h1>

          <div className="mb-6 grid grid-cols-3 rounded-lg border bg-white p-1">
            <button
              onClick={() => setActiveTab('providers')}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                activeTab === 'providers' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              AI Provider
            </button>
            <button
              onClick={() => setActiveTab('personas')}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                activeTab === 'personas' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Brain size={16} />
              角色
            </button>
            <button
              onClick={() => setActiveTab('retrieval')}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                activeTab === 'retrieval' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              检索与重排序
            </button>
          </div>

          {activeTab === 'providers' && (
            <>
              <ProviderForm
                title="AI 对话"
                purpose="chat"
                icon={<Bot size={20} className="text-blue-600" />}
              />

              <ProviderForm
                title="Embedding"
                purpose="embedding"
                icon={<Database size={20} className="text-green-600" />}
              />
            </>
          )}

          {activeTab === 'personas' && (
            <PersonaSettings />
          )}

          {activeTab === 'retrieval' && (
            <RetrievalSettings />
          )}
        </div>
      </div>
    </div>
  );
}
