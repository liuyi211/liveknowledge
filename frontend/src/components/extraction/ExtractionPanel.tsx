'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  job: any;
  onClose: () => void;
}

export default function ExtractionPanel({ job, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'summary' | 'cards' | 'entities' | 'relations'>('summary');
  const [adoptedSummary, setAdoptedSummary] = useState(false);
  const [adoptedCards, setAdoptedCards] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const output = job.output || {};

  const handleAdopt = async () => {
    setSaving(true);
    try {
      await api.extraction.adopt(job.id, {
        summary: adoptedSummary ? output.summary : null,
        cards: output.cards?.filter((_: any, i: number) => adoptedCards.includes(i)),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { key: 'summary' as const, label: '摘要' },
    { key: 'cards' as const, label: `闪卡 (${output.cards?.length || 0})` },
    { key: 'entities' as const, label: `概念 (${output.entities?.length || 0})` },
    { key: 'relations' as const, label: `关系 (${output.relations?.length || 0})` },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[800px] max-h-[85vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-bold">提炼结果预览</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex border-b">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm ${activeTab === tab.key ? 'border-b-2 border-blue-500 text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'summary' && output.summary && (
            <div>
              <label className="flex items-center gap-2 mb-3">
                <input type="checkbox" checked={adoptedSummary}
                  onChange={e => setAdoptedSummary(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">采纳为笔记</span>
              </label>
              <div className="bg-gray-50 p-4 rounded-md text-sm leading-relaxed whitespace-pre-wrap">{output.summary}</div>
            </div>
          )}

          {activeTab === 'cards' && output.cards?.map((card: any, i: number) => (
            <div key={i} className="border rounded-md p-3 mb-2">
              <label className="flex items-center gap-2 mb-2">
                <input type="checkbox"
                  checked={adoptedCards.includes(i)}
                  onChange={e => {
                    setAdoptedCards(e.target.checked
                      ? [...adoptedCards, i]
                      : adoptedCards.filter(c => c !== i)
                    );
                  }}
                  className="rounded"
                />
                <span className="text-sm font-medium">采纳</span>
              </label>
              <div className="text-sm font-medium text-gray-800">Q: {card.front}</div>
              <div className="text-sm text-gray-600 mt-1">A: {card.back}</div>
            </div>
          ))}

          {activeTab === 'entities' && output.entities?.map((e: any, i: number) => (
            <div key={i} className="border rounded-md p-3 mb-2">
              <span className="font-medium">{e.name}</span>
              <span className="text-gray-500 text-xs ml-2">({e.type})</span>
              <p className="text-sm text-gray-600 mt-1">{e.description}</p>
            </div>
          ))}

          {activeTab === 'relations' && output.relations?.map((r: any, i: number) => (
            <div key={i} className="border rounded-md p-3 mb-2 text-sm">
              <span className="font-medium">{r.source}</span>
              <span className="text-blue-600 mx-2">→ {r.type} →</span>
              <span className="font-medium">{r.target}</span>
            </div>
          ))}
        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md border text-sm hover:bg-gray-50">取消</button>
          <button onClick={handleAdopt} disabled={saving || (!adoptedSummary && adoptedCards.length === 0)}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '采纳选中项'}
          </button>
        </div>
      </div>
    </div>
  );
}
