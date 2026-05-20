'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import type { ConceptDetail, GraphData, GraphEdge, GraphHealth, GraphNode, GraphOverview, GraphPathResult, GraphQualityReport, LearningPath } from '@/types';
import {
  AlertTriangle,
  BookOpen,
  Brain,
  Check,
  CircleDot,
  Filter,
  GitBranch,
  Loader2,
  Network,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

const RELATION_TYPES = [
  'ALL',
  'IS_A',
  'PART_OF',
  'PREREQUISITE_OF',
  'RELATED_TO',
  'DERIVES_FROM',
  'CONTRASTS_WITH',
];

type GraphMode = 'overview' | 'neighborhood';
type SideTab = 'detail' | 'quality' | 'path';

function layoutNodes(nodes: GraphNode[], width: number, height: number): GraphNode[] {
  if (nodes.length === 0) return [];
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(110, Math.min(width, height) / 2 - 72);

  return nodes.map((node, index) => {
    if (nodes.length === 1) return { ...node, x: centerX, y: centerY };
    const ring = Math.floor(index / 18);
    const ringIndex = index % 18;
    const ringCount = Math.min(18, nodes.length - ring * 18);
    const angle = (Math.PI * 2 * ringIndex) / ringCount - Math.PI / 2;
    const ringRadius = radius * (0.55 + ring * 0.25);
    return {
      ...node,
      x: centerX + Math.cos(angle) * ringRadius,
      y: centerY + Math.sin(angle) * ringRadius,
    };
  });
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.source}-${edge.target}-${edge.type}`;
}

function GraphCanvas({
  nodes,
  edges,
  selectedId,
  mode,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  mode: GraphMode;
  onSelect: (node: GraphNode) => void;
}) {
  const width = 900;
  const height = 620;
  const laidOutNodes = useMemo(() => layoutNodes(nodes, width, height), [nodes]);
  const nodeById = useMemo(() => new Map(laidOutNodes.map(node => [node.id, node])), [laidOutNodes]);

  if (nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-center text-gray-500">
        <div>
          <Network className="mx-auto mb-3 text-gray-300" size={42} />
          <div className="font-medium text-gray-700">还没有可展示的图谱</div>
          <p className="mt-2 text-sm">先从对话、笔记或文档执行提炼，并采纳概念关系。</p>
        </div>
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full bg-white">
      <defs>
        <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {edges.map((edge) => {
        const source = nodeById.get(String(edge.source));
        const target = nodeById.get(String(edge.target));
        if (!source || !target) return null;
        return (
          <g key={edge.id || edgeKey(edge)}>
            <line
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={edge.type === 'PREREQUISITE_OF' ? '#f97316' : '#cbd5e1'}
              strokeWidth={Math.max(1.2, edge.confidence * 2.2)}
              markerEnd="url(#graph-arrow)"
            />
            <text
              x={((source.x ?? 0) + (target.x ?? 0)) / 2}
              y={((source.y ?? 0) + (target.y ?? 0)) / 2 - 5}
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
            >
              {edge.type}
            </text>
          </g>
        );
      })}

      {laidOutNodes.map((node) => {
        const selected = selectedId === node.id;
        const size = Math.min(36, 18 + (node.noteCount ?? 0) * 3);
        const focused = mode === 'neighborhood' && selected;
        return (
          <g
            key={node.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(node)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSelect(node);
            }}
            className="cursor-pointer"
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={size}
              fill={node.isolated ? '#f8fafc' : focused ? '#dbeafe' : '#e0f2fe'}
              stroke={selected ? '#2563eb' : node.isolated ? '#cbd5e1' : '#0284c7'}
              strokeWidth={selected ? 4 : 2}
            />
            <text
              x={node.x}
              y={(node.y ?? 0) + size + 16}
              textAnchor="middle"
              className="fill-slate-700 text-[12px] font-medium"
            >
              {node.label.length > 14 ? `${node.label.slice(0, 13)}...` : node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function GraphPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [relationType, setRelationType] = useState('ALL');
  const [isolatedOnly, setIsolatedOnly] = useState(false);
  const [mode, setMode] = useState<GraphMode>('overview');
  const [sideTab, setSideTab] = useState<SideTab>('detail');
  const [overview, setOverview] = useState<GraphOverview | null>(null);
  const [neighborhood, setNeighborhood] = useState<GraphData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [quality, setQuality] = useState<GraphQualityReport | null>(null);
  const [health, setHealth] = useState<GraphHealth | null>(null);
  const [learningPath, setLearningPath] = useState<LearningPath | null>(null);
  const [pathResult, setPathResult] = useState<GraphPathResult | null>(null);
  const [pathSourceId, setPathSourceId] = useState('');
  const [pathTargetId, setPathTargetId] = useState('');
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityBusyId, setQualityBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleGraph = mode === 'neighborhood' && neighborhood ? neighborhood : overview;

  useEffect(() => {
    api.auth.me()
      .then(() => setAuthLoading(false))
      .catch(() => router.push('/login'));
  }, [router]);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.graph.overview({
        limit: 120,
        q: query.trim() || undefined,
        relationType: relationType === 'ALL' ? undefined : relationType,
        isolatedOnly,
      });
      setOverview(data);
      if (mode === 'overview' && selectedId && !data.nodes.some((node: GraphNode) => node.id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载图谱失败');
    } finally {
      setLoading(false);
    }
  };

  const loadQuality = async () => {
    setQualityLoading(true);
    try {
      setQuality(await api.graph.quality({ limit: 50 }));
    } finally {
      setQualityLoading(false);
    }
  };

  const loadHealth = async () => {
    setHealth(await api.graph.health());
  };

  const loadLearningPath = async (targetConceptId?: string) => {
    setLearningPath(await api.graph.learningPath({ targetConceptId, limit: 8 }));
  };

  useEffect(() => {
    if (!authLoading) loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, query, relationType, isolatedOnly, mode]);

  useEffect(() => {
    if (!authLoading) loadQuality();
  }, [authLoading]);

  useEffect(() => {
    if (!authLoading) {
      loadHealth().catch(() => {});
      loadLearningPath().catch(() => {});
    }
  }, [authLoading]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetailLoading(true);

    api.graph.concept(selectedId)
      .then((data: ConceptDetail) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const focusNeighborhood = async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.graph.neighborhood(selectedId);
      setNeighborhood(data);
      setMode('neighborhood');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载邻域失败');
    } finally {
      setLoading(false);
    }
  };

  const returnToOverview = () => {
    setMode('overview');
    setNeighborhood(null);
  };

  const setScope = (nextIsolatedOnly: boolean) => {
    setIsolatedOnly(nextIsolatedOnly);
    returnToOverview();
  };

  const resetFilters = () => {
    setQuery('');
    setRelationType('ALL');
    setIsolatedOnly(false);
    returnToOverview();
  };

  const confirmRelation = async (relationId: string) => {
    setQualityBusyId(relationId);
    try {
      await api.graph.confirmRelation(relationId);
      await Promise.all([loadQuality(), loadOverview()]);
    } finally {
      setQualityBusyId(null);
    }
  };

  const deleteRelation = async (relationId: string) => {
    setQualityBusyId(relationId);
    try {
      await api.graph.deleteRelation(relationId);
      await Promise.all([loadQuality(), loadOverview()]);
    } finally {
      setQualityBusyId(null);
    }
  };

  const syncNeo4j = async () => {
    setSyncStatus('正在同步 Neo4j...');
    try {
      const result = await api.graph.syncNeo4j();
      setSyncStatus(result.available
        ? `已同步 ${result.syncedConcepts} 个概念、${result.syncedRelations} 条关系`
        : 'Neo4j 未连接，已跳过同步');
    } catch (err) {
      setSyncStatus(err instanceof Error ? err.message : 'Neo4j 同步失败');
    }
  };

  const runPathSearch = async () => {
    if (!pathSourceId || !pathTargetId) return;
    setPathResult(await api.graph.path({ sourceId: pathSourceId, targetId: pathTargetId, maxDepth: 5 }));
  };

  if (authLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <aside className="w-72 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2 text-gray-900 font-semibold">
            <GitBranch size={18} />
            知识图谱
          </div>
          <p className="mt-1 text-xs text-gray-500">从提炼结果自动生成的概念网络。</p>
        </div>

        <div className="p-4 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">搜索概念</span>
            <div className="mt-2 flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2">
              <Search size={16} className="text-gray-400" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  returnToOverview();
                }}
                placeholder="输入概念、领域或描述"
                className="w-full bg-transparent text-sm outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-700">
                  <X size={14} />
                </button>
              )}
            </div>
          </label>

          <label className="block">
            <span className="flex items-center gap-1 text-xs font-medium text-gray-500">
              <Filter size={14} />
              关系类型
            </span>
            <select
              value={relationType}
              onChange={(event) => {
                const nextType = event.target.value;
                setRelationType(nextType);
                if (nextType === 'ALL') setIsolatedOnly(false);
                returnToOverview();
              }}
              className="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
            >
              {RELATION_TYPES.map(type => (
                <option key={type} value={type}>{type === 'ALL' ? '全部关系' : type}</option>
              ))}
            </select>
          </label>

          <div className="rounded-md border border-gray-200 p-1">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setScope(false)}
                className={`flex items-center justify-between rounded px-3 py-2 text-sm transition-colors ${
                  !isolatedOnly
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Network size={15} />
                  全部概念
                </span>
                <span>{overview?.stats.conceptCount ?? 0}</span>
              </button>
              <button
                type="button"
                onClick={() => setScope(true)}
                className={`flex items-center justify-between rounded px-3 py-2 text-sm transition-colors ${
                  isolatedOnly
                    ? 'bg-amber-50 text-amber-800'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <CircleDot size={15} />
                  只看孤立
                </span>
                <span>{overview?.stats.isolatedCount ?? 0}</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw size={15} />
            重置视图
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 px-4 pb-4">
          <Metric value={overview?.stats.conceptCount ?? 0} label="概念" />
          <Metric value={overview?.stats.relationCount ?? 0} label="关系" />
          <Metric value={overview?.stats.isolatedCount ?? 0} label="孤立" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-gray-200 p-2">
          {(overview?.nodes ?? []).map(node => (
            <button
              key={node.id}
              type="button"
              onClick={() => {
                setSelectedId(node.id);
                setSideTab('detail');
              }}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                selectedId === node.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{node.label}</span>
                {node.isolated ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">孤立</span> : null}
              </div>
              <div className="mt-1 truncate text-xs text-gray-500">{node.description || node.domain || '暂无描述'}</div>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 flex flex-col">
        <div className="h-14 border-b border-gray-200 bg-white px-5 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              {mode === 'neighborhood' ? '邻域视图' : '图谱工作台'}
            </h1>
            <p className="text-xs text-gray-500">
              {mode === 'neighborhood'
                ? '正在聚焦当前概念的一跳邻居。'
                : '点击节点查看来源笔记、相关卡片和关系证据。'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'neighborhood' ? (
              <button
                type="button"
                onClick={returnToOverview}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                返回全图
              </button>
            ) : null}
            <button
              type="button"
              onClick={syncNeo4j}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              同步 Neo4j
            </button>
            {loading && <Loader2 className="animate-spin text-gray-400" size={18} />}
          </div>
        </div>
        {syncStatus ? <div className="border-b border-gray-200 bg-blue-50 px-5 py-2 text-xs text-blue-700">{syncStatus}</div> : null}

        <div className="min-h-0 flex-1">
          {error ? (
            <div className="h-full flex items-center justify-center text-sm text-red-600">{error}</div>
          ) : (
            <GraphCanvas
              nodes={visibleGraph?.nodes ?? []}
              edges={visibleGraph?.edges ?? []}
              selectedId={selectedId}
              mode={mode}
              onSelect={(node) => {
                setSelectedId(node.id);
                setSideTab('detail');
              }}
            />
          )}
        </div>
      </main>

      <aside className="w-96 border-l border-gray-200 bg-white flex flex-col">
        <div className="border-b border-gray-200 p-3">
          <div className="grid grid-cols-3 gap-2 rounded-md bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setSideTab('detail')}
              className={`rounded px-3 py-1.5 text-sm ${sideTab === 'detail' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              概念详情
            </button>
            <button
              type="button"
              onClick={() => setSideTab('quality')}
              className={`rounded px-3 py-1.5 text-sm ${sideTab === 'quality' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              质量治理
            </button>
            <button
              type="button"
              onClick={() => setSideTab('path')}
              className={`rounded px-3 py-1.5 text-sm ${sideTab === 'path' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              学习路径
            </button>
          </div>
        </div>

        {sideTab === 'detail' ? (
          <DetailPanel
            selectedId={selectedId}
            detail={detail}
            loading={detailLoading}
            onFocusNeighborhood={focusNeighborhood}
          />
        ) : (
          sideTab === 'quality' ? (
          <QualityPanel
            quality={quality}
            health={health}
            loading={qualityLoading}
            busyId={qualityBusyId}
            onRefresh={loadQuality}
            onSelectConcept={(id) => {
              setSelectedId(id);
              setSideTab('detail');
            }}
            onConfirmRelation={confirmRelation}
            onDeleteRelation={deleteRelation}
          />
          ) : (
            <PathPanel
              concepts={overview?.nodes ?? []}
              learningPath={learningPath}
              pathResult={pathResult}
              sourceId={pathSourceId}
              targetId={pathTargetId}
              onSourceChange={setPathSourceId}
              onTargetChange={setPathTargetId}
              onSearch={runPathSearch}
              onRecommendForConcept={(id) => loadLearningPath(id)}
            />
          )
        )}
      </aside>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-md border border-gray-200 p-2">
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function DetailPanel({
  selectedId,
  detail,
  loading,
  onFocusNeighborhood,
}: {
  selectedId: string | null;
  detail: ConceptDetail | null;
  loading: boolean;
  onFocusNeighborhood: () => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {!selectedId ? (
        <div className="pt-24 text-center text-sm text-gray-500">选择一个节点开始查看。</div>
      ) : loading ? (
        <div className="pt-24 flex justify-center">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      ) : detail ? (
        <div className="space-y-5">
          <section>
            <div className="text-lg font-semibold text-gray-900">{detail.concept.label}</div>
            <p className="mt-2 text-sm leading-6 text-gray-600">{detail.concept.description || '暂无描述'}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {detail.concept.domain && <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-600">{detail.concept.domain}</span>}
              <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">
                置信度 {Math.round(detail.concept.confidence * 100)}%
              </span>
            </div>
            <button
              type="button"
              onClick={onFocusNeighborhood}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Network size={15} />
              聚焦邻域
            </button>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-800">
              <BookOpen size={16} />
              来源笔记
            </div>
            {detail.notes.length === 0 ? (
              <div className="text-sm text-gray-400">暂无关联笔记</div>
            ) : detail.notes.map(note => (
              <Link key={note.id} href={`/notes?noteId=${note.id}`} className="block rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                <div className="text-sm font-medium text-gray-900">{note.title}</div>
                <div className="mt-1 text-xs leading-5 text-gray-500">{note.summary}</div>
              </Link>
            ))}
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-800">
              <Brain size={16} />
              相关卡片
            </div>
            {detail.cards.length === 0 ? (
              <div className="text-sm text-gray-400">暂无关联卡片</div>
            ) : detail.cards.map(card => (
              <Link key={card.id} href="/review" className="block rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                <div className="text-sm font-medium text-gray-900">{card.front}</div>
                <div className="mt-1 text-xs leading-5 text-gray-500">{card.back}</div>
              </Link>
            ))}
          </section>

          <section>
            <div className="mb-2 text-sm font-medium text-gray-800">关系证据</div>
            {detail.relations.length === 0 ? (
              <div className="text-sm text-gray-400">暂无关系</div>
            ) : detail.relations.map(relation => (
              <div key={relation.id} className="rounded-md border border-gray-200 p-3 text-sm">
                <div className="font-medium text-gray-900">{relation.relationType}</div>
                <div className="mt-1 text-xs leading-5 text-gray-500">{relation.evidence || '暂无证据说明'}</div>
              </div>
            ))}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function QualityPanel({
  quality,
  health,
  loading,
  busyId,
  onRefresh,
  onSelectConcept,
  onConfirmRelation,
  onDeleteRelation,
}: {
  quality: GraphQualityReport | null;
  health: GraphHealth | null;
  loading: boolean;
  busyId: string | null;
  onRefresh: () => void;
  onSelectConcept: (id: string) => void;
  onConfirmRelation: (id: string) => void;
  onDeleteRelation: (id: string) => void;
}) {
  if (loading && !quality) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">图谱质量治理</div>
          <p className="mt-1 text-xs text-gray-500">先处理会影响使用的结构问题。</p>
        </div>
        <button type="button" onClick={onRefresh} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
          刷新
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric value={quality?.stats.isolatedConceptCount ?? 0} label="孤立概念" />
        <Metric value={quality?.stats.lowConfidenceRelationCount ?? 0} label="待确认" />
        <Metric value={quality?.stats.unboundCardCount ?? 0} label="未绑定卡" />
      </div>

      {health ? (
        <section className="mt-5 rounded-md border border-gray-200 p-3">
          <div className="text-sm font-medium text-gray-900">图谱健康分</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900">{health.healthScore}</div>
          <div className="mt-2 space-y-1 text-xs text-gray-500">
            <div>卡片绑定率 {Math.round(health.cardBindingRatio * 100)}%</div>
            <div>笔记绑定率 {Math.round(health.noteBindingRatio * 100)}%</div>
            <div>关系密度 {health.relationDensity.toFixed(2)}</div>
          </div>
        </section>
      ) : null}

      <section className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-800">
          <AlertTriangle size={16} />
          待确认关系
        </div>
        {quality?.lowConfidenceRelations.length ? (
          <div className="space-y-3">
            {quality.lowConfidenceRelations.map(relation => (
              <article key={relation.id} className="rounded-md border border-gray-200 p-3">
                <div className="text-sm font-medium text-gray-900">
                  {relation.source.label} {'->'} {relation.target.label}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {relation.type} · 置信度 {Math.round(relation.confidence * 100)}%
                </div>
                <div className="mt-2 text-xs leading-5 text-gray-500">{relation.evidence || '缺少证据说明'}</div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === relation.id}
                    onClick={() => onConfirmRelation(relation.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    <Check size={13} />
                    确认
                  </button>
                  <button
                    type="button"
                    disabled={busyId === relation.id}
                    onClick={() => onDeleteRelation(relation.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyQuality text="暂无待确认关系。" />
        )}
      </section>

      <section className="mt-5">
        <div className="mb-2 text-sm font-medium text-gray-800">孤立概念</div>
        {quality?.isolatedConcepts.length ? (
          <div className="space-y-2">
            {quality.isolatedConcepts.map(concept => (
              <button
                key={concept.id}
                type="button"
                onClick={() => onSelectConcept(concept.id)}
                className="w-full rounded-md border border-gray-200 p-3 text-left hover:bg-gray-50"
              >
                <div className="text-sm font-medium text-gray-900">{concept.label}</div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{concept.description || concept.domain || '暂无描述'}</div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyQuality text="暂无孤立概念。" />
        )}
      </section>

      <section className="mt-5">
        <div className="mb-2 text-sm font-medium text-gray-800">未绑定图谱的卡片</div>
        {quality?.unboundCards.length ? (
          <div className="space-y-2">
            {quality.unboundCards.map(card => (
              <Link key={card.id} href="/review" className="block rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                <div className="text-sm font-medium text-gray-900">{card.front}</div>
                <div className="mt-1 text-xs text-gray-500">{card.noteTitle || '未关联笔记'} · 遗忘 {card.lapseCount} 次</div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyQuality text="暂无未绑定卡片。" />
        )}
      </section>
    </div>
  );
}

function EmptyQuality({ text }: { text: string }) {
  return <div className="rounded-md bg-gray-50 px-3 py-4 text-sm text-gray-500">{text}</div>;
}

function PathPanel({
  concepts,
  learningPath,
  pathResult,
  sourceId,
  targetId,
  onSourceChange,
  onTargetChange,
  onSearch,
  onRecommendForConcept,
}: {
  concepts: GraphNode[];
  learningPath: LearningPath | null;
  pathResult: GraphPathResult | null;
  sourceId: string;
  targetId: string;
  onSourceChange: (id: string) => void;
  onTargetChange: (id: string) => void;
  onSearch: () => void;
  onRecommendForConcept: (id: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="font-semibold text-gray-900">学习路径</div>
      <p className="mt-1 text-xs text-gray-500">基于 PREREQUISITE_OF 关系生成可执行顺序。</p>

      <section className="mt-4 rounded-md border border-gray-200 p-3">
        <div className="mb-2 text-sm font-medium text-gray-800">多跳路径查询</div>
        <div className="space-y-2">
          <select value={sourceId} onChange={(event) => onSourceChange(event.target.value)} className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm">
            <option value="">选择起点概念</option>
            {concepts.map(concept => <option key={concept.id} value={concept.id}>{concept.label}</option>)}
          </select>
          <select value={targetId} onChange={(event) => onTargetChange(event.target.value)} className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm">
            <option value="">选择终点概念</option>
            {concepts.map(concept => <option key={concept.id} value={concept.id}>{concept.label}</option>)}
          </select>
          <button type="button" onClick={onSearch} disabled={!sourceId || !targetId} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm text-white disabled:bg-gray-300">
            查找路径
          </button>
        </div>
        {pathResult ? (
          <div className="mt-3 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
            {pathResult.nodes.length ? pathResult.nodes.map(node => node.label).join(' -> ') : '没有找到路径'}
          </div>
        ) : null}
      </section>

      <section className="mt-4">
        <div className="mb-2 text-sm font-medium text-gray-800">推荐学习顺序</div>
        {learningPath?.steps.length ? (
          <div className="space-y-2">
            {learningPath.steps.map(step => (
              <button
                key={step.id}
                type="button"
                onClick={() => onRecommendForConcept(step.id)}
                className="w-full rounded-md border border-gray-200 p-3 text-left hover:bg-gray-50"
              >
                <div className="text-sm font-medium text-gray-900">{step.order}. {step.label}</div>
                <div className="mt-1 text-xs text-gray-500">
                  前置 {step.prerequisiteCount} · 解锁 {step.unlocksCount}
                </div>
                {step.description ? <div className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{step.description}</div> : null}
              </button>
            ))}
          </div>
        ) : (
          <EmptyQuality text="还没有足够的前置关系生成路径。" />
        )}
      </section>
    </div>
  );
}
