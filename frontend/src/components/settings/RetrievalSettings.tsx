'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Search, SlidersHorizontal } from 'lucide-react';

interface RetrievalConfig {
  vectorTopK: number;
  fullTextTopK: number;
  localSearchTopK: number;
  globalSearchTopK: number;
  rrfK: number;
  rrfTopN: number;
  rerankEnabled: boolean;
  rerankModel: string | null;
  rerankProviderConfigId: string | null;
  rerankTopN: number;
  contextBudgetTokens: number;
}

const defaultConfig: RetrievalConfig = {
  vectorTopK: 10,
  fullTextTopK: 10,
  localSearchTopK: 10,
  globalSearchTopK: 5,
  rrfK: 60,
  rrfTopN: 10,
  rerankEnabled: true,
  rerankModel: null,
  rerankProviderConfigId: null,
  rerankTopN: 5,
  contextBudgetTokens: 1500,
};

export default function RetrievalSettings() {
  const [config, setConfig] = useState<RetrievalConfig>(defaultConfig);
  const [providers, setProviders] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.retrieval.getSettings().catch(() => defaultConfig),
      api.providers.list().catch(() => []),
    ]).then(([settings, provs]) => {
      setConfig({ ...defaultConfig, ...settings });
      setProviders(provs.filter((p: any) => p.purpose === 'chat' && p.isActive));
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.retrieval.updateSettings(config);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Search size={20} className="text-purple-600" />
          <h2 className="text-lg font-semibold">检索与重排序</h2>
        </div>
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center gap-2 mb-6">
        <Search size={20} className="text-purple-600" />
        <h2 className="text-lg font-semibold">检索与重排序</h2>
      </div>

      <div className="space-y-6">
        {/* Retrieval Parameters */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal size={14} className="text-gray-500" />
            <h3 className="text-sm font-medium text-gray-700">检索参数</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberField label="向量检索 TOP-K" value={config.vectorTopK} desc="每路向量检索返回的候选数量"
              onChange={v => setConfig({ ...config, vectorTopK: v })} />
            <NumberField label="全文检索 TOP-K" value={config.fullTextTopK} desc="每路全文检索返回的候选数量"
              onChange={v => setConfig({ ...config, fullTextTopK: v })} />
            <NumberField label="Local Search TOP-K" value={config.localSearchTopK} desc="图谱局部搜索返回的候选数量"
              onChange={v => setConfig({ ...config, localSearchTopK: v })} />
            <NumberField label="Global Search TOP-K" value={config.globalSearchTopK} desc="图谱全局搜索返回的社区数量"
              onChange={v => setConfig({ ...config, globalSearchTopK: v })} />
          </div>
        </section>

        {/* RRF Parameters */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal size={14} className="text-gray-500" />
            <h3 className="text-sm font-medium text-gray-700">RRF 融合参数</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberField label="RRF k 值" value={config.rrfK} desc="平滑常数，推荐值 60（论文标准值）"
              onChange={v => setConfig({ ...config, rrfK: v })} />
            <NumberField label="RRF 取前 N" value={config.rrfTopN} desc="融合后进入重排序的候选数量"
              onChange={v => setConfig({ ...config, rrfTopN: v })} />
          </div>
        </section>

        {/* Rerank */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal size={14} className="text-gray-500" />
            <h3 className="text-sm font-medium text-gray-700">重排序</h3>
          </div>
          <label className="flex items-center gap-2 mb-3">
            <input type="checkbox" checked={config.rerankEnabled}
              onChange={e => setConfig({ ...config, rerankEnabled: e.target.checked })}
              className="rounded" />
            <span className="text-sm">启用重排序</span>
          </label>
          {config.rerankEnabled && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">重排序模型</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm"
                  value={config.rerankProviderConfigId || ''}
                  onChange={e => {
                    const provider = providers.find(p => p.id === e.target.value);
                    setConfig({
                      ...config,
                      rerankProviderConfigId: e.target.value || null,
                      rerankModel: provider?.model || null,
                    });
                  }}>
                  <option value="">选择模型</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.providerType} - {p.model}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">建议选择轻量、低成本的模型</p>
              </div>
              <NumberField label="重排序取前 N" value={config.rerankTopN} desc="最终注入上下文的文档数量"
                onChange={v => setConfig({ ...config, rerankTopN: v })} />
            </div>
          )}
        </section>

        {/* Context Budget */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal size={14} className="text-gray-500" />
            <h3 className="text-sm font-medium text-gray-700">上下文预算</h3>
          </div>
          <NumberField label="检索上下文预算" value={config.contextBudgetTokens} desc="检索结果占用的上下文 token 上限"
            onChange={v => setConfig({ ...config, contextBudgetTokens: v })} />
        </section>

        <div className="flex justify-end pt-4 border-t">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NumberField({ label, value, desc, onChange }: {
  label: string; value: number; desc: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1">{label}</label>
      <input type="number" value={value}
        onChange={e => onChange(Math.max(1, parseInt(e.target.value) || 0))}
        className="w-full border rounded-md px-3 py-2 text-sm"
      />
      <p className="text-xs text-gray-500 mt-1">{desc}</p>
    </div>
  );
}
