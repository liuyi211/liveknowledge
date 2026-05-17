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
        <div className="max-w-2xl mx-auto py-8 px-4">
          <h1 className="text-2xl font-bold mb-8">设置</h1>

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

          <div className="mt-8">
            <RetrievalSettings />
          </div>
        </div>
      </div>
    </div>
  );
}
