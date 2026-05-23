'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProviderForm from '@/components/settings/ProviderForm';
import RetrievalSettings from '@/components/settings/RetrievalSettings';
import PersonaSettings from '@/components/settings/PersonaSettings';
import CognitiveProfileSettings from '@/components/settings/CognitiveProfileSettings';
import MemorySettings from '@/components/settings/MemorySettings';
import { api } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import { Bot, Brain, BrainCircuit, Database, Search, UserRound } from 'lucide-react';

type SettingsTab = 'providers' | 'personas' | 'retrieval' | 'profile' | 'memory';

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');

  useEffect(() => {
    api.auth.me()
      .then(() => setLoading(false))
      .catch(() => router.push('/login'));
  }, [router]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const tab = search.get('tab');
    if (tab === 'providers' || tab === 'personas' || tab === 'retrieval' || tab === 'profile' || tab === 'memory') {
      setActiveTab(tab);
    }
  }, []);

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
        <div className="mx-auto max-w-5xl px-4 py-8">
          <h1 className="mb-8 text-2xl font-bold">设置</h1>

          <div className="mb-6 grid grid-cols-2 rounded-lg border bg-white p-1 sm:grid-cols-5">
            <TabButton active={activeTab === 'providers'} icon={Bot} label="AI Provider" onClick={() => setActiveTab('providers')} />
            <TabButton active={activeTab === 'personas'} icon={Brain} label="角色" onClick={() => setActiveTab('personas')} />
            <TabButton active={activeTab === 'retrieval'} icon={Search} label="检索" onClick={() => setActiveTab('retrieval')} />
            <TabButton active={activeTab === 'profile'} icon={UserRound} label="画像" onClick={() => setActiveTab('profile')} />
            <TabButton active={activeTab === 'memory'} icon={BrainCircuit} label="记忆" onClick={() => setActiveTab('memory')} />
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

          {activeTab === 'personas' && <PersonaSettings />}
          {activeTab === 'retrieval' && <RetrievalSettings />}
          {activeTab === 'profile' && <CognitiveProfileSettings />}
          {activeTab === 'memory' && <MemorySettings />}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Bot;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
        active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      <Icon size={16} />
      <span className="truncate">{label}</span>
    </button>
  );
}
