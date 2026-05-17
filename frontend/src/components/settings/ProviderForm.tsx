'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Bot, Eye, EyeOff, Check, AlertCircle, Loader2 } from 'lucide-react';

interface ProviderConfig {
  id?: string;
  providerType: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface ProviderFormProps {
  title: string;
  purpose: 'chat' | 'embedding';
  icon: React.ReactNode;
}

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'zhipu', label: '智谱 AI' },
  { value: 'moonshot', label: 'Moonshot' },
  { value: 'bailian', label: '阿里百炼' },
];

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  zhipu: 'glm-4-flash',
  moonshot: 'moonshot-v1-8k',
  bailian: 'qwen-turbo',
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  moonshot: 'https://api.moonshot.cn/v1',
  bailian: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

export default function ProviderForm({ title, purpose, icon }: ProviderFormProps) {
  const [config, setConfig] = useState<ProviderConfig>({
    providerType: 'zhipu',
    apiKey: '',
    baseUrl: '',
    model: '',
  });
  const [showKey, setShowKey] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  // Load existing config on mount
  const loadConfig = () => {
    api.providers.list().then((configs: Array<ProviderConfig & { purpose: string; isActive: boolean }>) => {
      const existing = configs.find((c) => c.purpose === purpose && c.isActive);
      if (existing) {
        setConfig({
          providerType: existing.providerType,
          apiKey: '',
          baseUrl: existing.baseUrl || '',
          model: existing.model || '',
        });
        setHasExisting(true);
      } else {
        // Reset to defaults if no existing config
        setConfig({
          providerType: 'zhipu',
          apiKey: '',
          baseUrl: DEFAULT_BASE_URLS['zhipu'],
          model: DEFAULT_MODELS['zhipu'],
        });
        setHasExisting(false);
      }
    }).catch(() => {});
  };

  useEffect(() => {
    loadConfig();
  }, [purpose]);

  const handleProviderChange = (providerType: string) => {
    setConfig({
      ...config,
      providerType,
      baseUrl: DEFAULT_BASE_URLS[providerType] || '',
      model: DEFAULT_MODELS[providerType] || '',
    });
  };

  const handleTest = async () => {
    if (!config.apiKey) {
      setTestStatus('error');
      setTestMessage(hasExisting ? '请输入 API Key 进行测试' : '请输入 API Key');
      return;
    }

    setTestStatus('testing');
    setTestMessage('');

    try {
      const result = await api.providers.test({
        providerType: config.providerType,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl || undefined,
        model: config.model || undefined,
        purpose,
      });
      setTestStatus(result.success ? 'success' : 'error');
      setTestMessage(result.message);
    } catch (err) {
      setTestStatus('error');
      setTestMessage((err as Error).message);
    }
  };

  const handleSave = async () => {
    if (!config.apiKey && !hasExisting) {
      setSaveStatus('error');
      setSaveMessage('首次保存需要输入 API Key');
      return;
    }

    setSaveStatus('saving');
    setSaveMessage('');
    try {
      await api.providers.create({
        providerType: config.providerType,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl || undefined,
        model: config.model || undefined,
        purpose,
      });
      setSaveStatus('saved');
      setHasExisting(true);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      setSaveMessage((err as Error).message);
    }
  };

  return (
    <div className="bg-white border rounded-lg p-6 mb-6">
      <div className="flex items-center space-x-2 mb-6">
        {icon}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>

      <div className="space-y-4">
        {/* Provider */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
          <select
            value={config.providerType}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder={hasExisting ? '••••••' : '请输入 API Key'}
              className="w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Base URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
          <input
            type="text"
            value={config.baseUrl}
            onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
            placeholder="https://..."
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
          <input
            type="text"
            value={config.model}
            onChange={(e) => setConfig({ ...config, model: e.target.value })}
            placeholder={DEFAULT_MODELS[config.providerType]}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-3 pt-2">
          <button
            onClick={handleTest}
            disabled={testStatus === 'testing'}
            className={`flex items-center space-x-1 px-4 py-2 border rounded-md transition-colors ${
              testStatus === 'success'
                ? 'border-green-500 text-green-700 bg-green-50'
                : testStatus === 'error'
                ? 'border-red-500 text-red-700 bg-red-50'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            {testStatus === 'testing' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : testStatus === 'success' ? (
              <Check size={16} />
            ) : testStatus === 'error' ? (
              <AlertCircle size={16} />
            ) : (
              <Bot size={16} />
            )}
            <span>
              {testStatus === 'testing'
                ? '测试中...'
                : testStatus === 'success'
                ? '连接成功'
                : testStatus === 'error'
                ? '连接失败'
                : '测试连接'}
            </span>
          </button>

          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={`flex items-center space-x-1 px-4 py-2 rounded-md transition-colors ${
              saveStatus === 'saved'
                ? 'bg-green-600 hover:bg-green-700'
                : saveStatus === 'error'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white disabled:opacity-50`}
          >
            {saveStatus === 'saving' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : saveStatus === 'saved' ? (
              <Check size={16} />
            ) : null}
            <span>
              {saveStatus === 'saving' ? '保存中...' : saveStatus === 'saved' ? '已保存' : saveStatus === 'error' ? '保存失败' : '保存'}
            </span>
          </button>
        </div>

        {/* Error messages */}
        {testMessage && testStatus === 'error' && (
          <p className="text-sm text-red-600">{testMessage}</p>
        )}
        {saveMessage && saveStatus === 'error' && (
          <p className="text-sm text-red-600">{saveMessage}</p>
        )}
      </div>
    </div>
  );
}
