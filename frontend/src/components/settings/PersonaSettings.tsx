'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, Brain, Plus, Trash2, WandSparkles } from 'lucide-react';
import { api } from '@/lib/api';
import type { Persona } from '@/types';

function PersonaCard({ persona, onDelete }: { persona: Persona; onDelete: (id: string) => void }) {
  const style = persona.teachingStyle || {};
  const chips = [
    ...(persona.knowledgeDomains || []).slice(0, 4),
    ...(style.tone || []).slice(0, 3),
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{persona.name}</h3>
            {persona.isBuiltin && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">内置</span>
            )}
          </div>
          {persona.description && (
            <p className="mt-1 text-sm leading-6 text-gray-600">{persona.description}</p>
          )}
        </div>
        {!persona.isBuiltin && (
          <button
            onClick={() => onDelete(persona.id)}
            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="删除角色"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span key={chip} className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
              {chip}
            </span>
          ))}
        </div>
      )}

      {style.responseStyle && style.responseStyle.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="mb-2 text-xs font-medium text-gray-500">回复结构</div>
          <ul className="space-y-1 text-sm leading-6 text-gray-700">
            {style.responseStyle.slice(0, 3).map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function PersonaSettings() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => ({
    builtin: personas.filter((persona) => persona.isBuiltin),
    custom: personas.filter((persona) => !persona.isBuiltin),
  }), [personas]);

  const loadPersonas = async () => {
    setLoading(true);
    try {
      const data = await api.personas.list();
      setPersonas(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPersonas().catch(() => setError('加载角色失败'));
  }, []);

  const handleGenerate = async () => {
    const trimmed = description.trim();
    if (!trimmed) return;

    setGenerating(true);
    setError(null);
    try {
      const persona = await api.personas.generate(trimmed);
      setPersonas((prev) => [...prev, persona]);
      setDescription('');
    } catch (err) {
      setError((err as Error).message || '生成角色失败，请检查对话模型配置');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await api.personas.delete(id);
    setPersonas((prev) => prev.filter((persona) => persona.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <WandSparkles size={18} className="text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">添加角色</h2>
        </div>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={5}
          placeholder="描述你想要的角色，例如：一个偏苏格拉底式的机器学习导师，擅长用问题引导我理解论文里的公式，不要直接给答案。"
          className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">系统会把描述转换为擅长领域、回复结构、追问策略、提醒和表达风格。</p>
          <button
            onClick={handleGenerate}
            disabled={generating || !description.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={16} />
            {generating ? '生成中' : '生成角色'}
          </button>
        </div>
        {error && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Bot size={18} className="text-gray-700" />
          <h2 className="text-base font-semibold text-gray-900">内置角色</h2>
        </div>
        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">加载中...</div>
        ) : (
          <div className="grid gap-3">
            {grouped.builtin.map((persona) => (
              <PersonaCard key={persona.id} persona={persona} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Brain size={18} className="text-gray-700" />
          <h2 className="text-base font-semibold text-gray-900">自定义角色</h2>
        </div>
        {grouped.custom.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            还没有自定义角色。写一段角色描述，就可以在对话页切换使用。
          </div>
        ) : (
          <div className="grid gap-3">
            {grouped.custom.map((persona) => (
              <PersonaCard key={persona.id} persona={persona} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
