'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProviderForm from '@/components/settings/ProviderForm';
import RetrievalSettings from '@/components/settings/RetrievalSettings';
import { api } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import { Bot, Database } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'providers' | 'retrieval'>('providers');

  useEffect(() => {
    api.auth.me()
      .then(() => setLoading(false))
      .catch(() => router.push('/login'));
  }, [router]);

  if (loading) {
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
      <Sidebar />
      <div className="flex-1 bg-gray-50 overflow-auto">
        <div className="max-w-3xl mx-auto py-8 px-4">
          <h1 className="text-2xl font-bold mb-8">设置</h1>

          <div className="mb-6 flex rounded-lg border bg-white p-1">
            <button
              onClick={() => setActiveTab('providers')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                activeTab === 'providers' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              AI Provider
            </button>
            <button
              onClick={() => setActiveTab('retrieval')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
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

          {activeTab === 'retrieval' && (
            <RetrievalSettings />
          )}
        </div>
      </div>
    </div>
  );
}
