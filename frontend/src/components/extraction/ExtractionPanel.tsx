'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Props {
  job: any;
  onClose: () => void;
}

type TabKey = 'summary' | 'cards' | 'entities' | 'relations';

function indexes(length = 0): number[] {
  return Array.from({ length }, (_, index) => index);
}

export default function ExtractionPanel({ job, onClose }: Props) {
  const output = useMemo(() => job.output || {}, [job.output]);
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [adoptedSummary, setAdoptedSummary] = useState(Boolean(output.summary));
  const [adoptedCards, setAdoptedCards] = useState<number[]>(indexes(output.cards?.length));
  const [adoptedEntities, setAdoptedEntities] = useState<number[]>(indexes(output.entities?.length));
  const [adoptedRelations, setAdoptedRelations] = useState<number[]>(indexes(output.relations?.length));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adoptResult, setAdoptResult] = useState<any>(null);

  useEffect(() => {
    setAdoptedSummary(Boolean(output.summary));
    setAdoptedCards(indexes(output.cards?.length));
    setAdoptedEntities(indexes(output.entities?.length));
    setAdoptedRelations(indexes(output.relations?.length));
  }, [output]);

  const handleAdopt = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await api.extraction.adopt(job.id, {
        summary: adoptedSummary ? output.summary : null,
        cards: output.cards?.filter((_: any, i: number) => adoptedCards.includes(i)) ?? [],
        entities: output.entities?.filter((_: any, i: number) => adoptedEntities.includes(i)) ?? [],
        relations: output.relations?.filter((_: any, i: number) => adoptedRelations.includes(i)) ?? [],
      });
      setAdoptResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步数据库失败');
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = (adoptedSummary ? 1 : 0) + adoptedCards.length + adoptedEntities.length + adoptedRelations.length;
  const meta = output.meta || {};
  const graphConceptCount = adoptResult?.graph?.conceptIds?.length ?? 0;
  const graphRelationCount = adoptResult?.graph?.relationIds?.length ?? 0;

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
          <div>
            <h2 className="text-lg font-bold">提炼结果预览</h2>
            {meta.version && (
              <p className="text-xs text-gray-500 mt-1">
                第 {meta.version} 次提炼
                {meta.duplicateSource ? ' · 检测到重复来源' : ''}
                {meta.previousJobIds?.length ? ` · 历史任务 ${meta.previousJobIds.length} 个` : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">关闭</button>
        </div>

        <div className="flex border-b">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm ${activeTab === tab.key ? 'border-b-2 border-blue-500 text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="border-b bg-blue-50 px-4 py-3 text-sm text-blue-800">
          概念和关系已默认选中。点击“同步到数据库”后，会写入笔记、闪卡和知识图谱。
        </div>

        {adoptResult ? (
          <div className="m-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <div className="font-medium">同步完成</div>
            <div className="mt-1">
              已写入 {adoptResult.cardIds?.length ?? 0} 张卡片、{graphConceptCount} 个概念、{graphRelationCount} 条关系。
            </div>
            <div className="mt-3 flex gap-2">
              <Link href="/graph" className="rounded-md bg-emerald-700 px-3 py-1.5 text-white hover:bg-emerald-800">
                查看知识图谱
              </Link>
              <button onClick={onClose} className="rounded-md border border-emerald-200 px-3 py-1.5 hover:bg-emerald-100">
                关闭
              </button>
            </div>
          </div>
        ) : null}

        {error ? <div className="mx-4 mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'summary' && output.summary && (
            <div>
              <label className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={adoptedSummary}
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
                <input
                  type="checkbox"
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

          {activeTab === 'entities' && output.entities?.map((entity: any, i: number) => (
            <div key={i} className="border rounded-md p-3 mb-2">
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={adoptedEntities.includes(i)}
                  onChange={event => {
                    setAdoptedEntities(event.target.checked
                      ? [...adoptedEntities, i]
                      : adoptedEntities.filter(item => item !== i)
                    );
                  }}
                  className="rounded"
                />
                <span className="text-sm font-medium">写入图谱</span>
              </label>
              <span className="font-medium">{entity.name}</span>
              <span className="text-gray-500 text-xs ml-2">({entity.type})</span>
              <p className="text-sm text-gray-600 mt-1">{entity.description}</p>
            </div>
          ))}

          {activeTab === 'relations' && output.relations?.map((relation: any, i: number) => (
            <div key={i} className="border rounded-md p-3 mb-2 text-sm">
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={adoptedRelations.includes(i)}
                  onChange={event => {
                    setAdoptedRelations(event.target.checked
                      ? [...adoptedRelations, i]
                      : adoptedRelations.filter(item => item !== i)
                    );
                  }}
                  className="rounded"
                />
                <span className="text-sm font-medium">写入图谱</span>
              </label>
              <span className="font-medium">{relation.source}</span>
              <span className="text-blue-600 mx-2">-&gt; {relation.type} -&gt;</span>
              <span className="font-medium">{relation.target}</span>
              {relation.description && <p className="text-gray-500 mt-1">{relation.description}</p>}
            </div>
          ))}
        </div>

        <div className="p-4 border-t flex justify-between gap-2">
          <div className="text-xs text-gray-500">
            已选 {adoptedEntities.length} 个概念、{adoptedRelations.length} 条关系
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-md border text-sm hover:bg-gray-50">取消</button>
            <button
              onClick={handleAdopt}
              disabled={saving || selectedCount === 0 || Boolean(adoptResult)}
              className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '同步中...' : `同步到数据库 (${selectedCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
