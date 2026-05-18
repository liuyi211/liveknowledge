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

interface ModelCapability {
  id: string;
  name: string;
  purpose: Array<'chat' | 'embedding'>;
  contextWindow: number;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsReasoning: boolean;
  maxOutputTokens: number;
  embeddingDimensions?: number;
}

interface ProviderMetadata {
  label: string;
  baseURL: string;
  models: ModelCapability[];
}

interface ProviderFormProps {
  title: string;
  purpose: 'chat' | 'embedding';
  icon: React.ReactNode;
}

export default function ProviderForm({ title, purpose, icon }: ProviderFormProps) {
  const [providerModels, setProviderModels] = useState<Record<string, ProviderMetadata>>({});
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

  const providers = Object.entries(providerModels);
  const currentProvider = providerModels[config.providerType];
  const purposeModels = currentProvider?.models.filter((model) => model.purpose.includes(purpose)) || [];
  const selectedModel = purposeModels.find((model) => model.id === config.model);

  const getDefaultProvider = (models: Record<string, ProviderMetadata>) => {
    if (models.zhipu?.models.some((model) => model.purpose.includes(purpose))) return 'zhipu';
    return Object.entries(models).find(([, provider]) =>
      provider.models.some((model) => model.purpose.includes(purpose))
    )?.[0] || 'zhipu';
  };

  const getDefaultModel = (providerType: string, models = providerModels) =>
    models[providerType]?.models.find((model) => model.purpose.includes(purpose))?.id || '';

  // Load existing config on mount
  const loadConfig = () => {
    Promise.all([
      api.providers.models(),
      api.providers.list(),
    ]).then(([models, configs]: [Record<string, ProviderMetadata>, Array<ProviderConfig & { purpose: string; isActive: boolean }>]) => {
      setProviderModels(models);
      const existing = configs.find((c) => c.purpose === purpose && c.isActive);
      if (existing) {
        setConfig({
          providerType: existing.providerType,
          apiKey: '',
          baseUrl: existing.baseUrl || models[existing.providerType]?.baseURL || '',
          model: existing.model || getDefaultModel(existing.providerType, models),
        });
        setHasExisting(true);
      } else {
        const providerType = getDefaultProvider(models);
        setConfig({
          providerType,
          apiKey: '',
          baseUrl: models[providerType]?.baseURL || '',
          model: getDefaultModel(providerType, models),
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
      baseUrl: providerModels[providerType]?.baseURL || '',
      model: getDefaultModel(providerType),
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
            {providers.map(([value, provider]) => (
              <option key={value} value={value}>{provider.label}</option>
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
          <select
            value={config.model}
            onChange={(e) => setConfig({ ...config, model: e.target.value })}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {purposeModels.map((model) => (
              <option key={model.id} value={model.id}>{model.name} ({model.id})</option>
            ))}
          </select>
          {selectedModel && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <CapabilityBadge label={`${selectedModel.contextWindow.toLocaleString()} ctx`} />
              {selectedModel.maxOutputTokens > 0 && <CapabilityBadge label={`${selectedModel.maxOutputTokens.toLocaleString()} out`} />}
              {selectedModel.supportsStreaming && <CapabilityBadge label="stream" />}
              {selectedModel.supportsVision && <CapabilityBadge label="vision" />}
              {selectedModel.supportsReasoning && <CapabilityBadge label="reasoning" />}
              {selectedModel.embeddingDimensions && <CapabilityBadge label={`${selectedModel.embeddingDimensions} dim`} />}
            </div>
          )}
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

function CapabilityBadge({ label }: { label: string }) {
  return (
    <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
      {label}
    </span>
  );
}
