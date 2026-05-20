'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import type { ConceptDetail, GraphData, GraphEdge, GraphNode, GraphOverview } from '@/types';
import {
  BookOpen,
  Brain,
  CircleDot,
  Filter,
  Loader2,
  Network,
  RotateCcw,
  Search,
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
type ForceNode = GraphNode & d3.SimulationNodeDatum & {
  radius: number;
};
type ForceLink = Omit<GraphEdge, 'source' | 'target'> & d3.SimulationLinkDatum<ForceNode>;

function layoutNodes(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number): GraphNode[] {
  if (nodes.length === 0) return [];
  const centerX = width / 2;
  const centerY = height / 2;
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const adjacency = new Map(nodes.map(node => [node.id, new Set<string>()]));

  edges.forEach((edge) => {
    const source = String(edge.source);
    const target = String(edge.target);
    if (!adjacency.has(source) || !adjacency.has(target)) return;
    adjacency.get(source)!.add(target);
    adjacency.get(target)!.add(source);
  });

  const visited = new Set<string>();
  const components: string[][] = [];
  nodes.forEach((node) => {
    if (visited.has(node.id)) return;
    const stack = [node.id];
    const component: string[] = [];
    visited.add(node.id);
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      adjacency.get(current)?.forEach((next) => {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      });
    }
    components.push(component);
  });

  components.sort((a, b) => b.length - a.length);

  const graphRadius = Math.max(170, Math.min(width, height) * 0.36);
  const placed = new Map<string, GraphNode>();

  components.forEach((component, componentIndex) => {
    const isMain = componentIndex === 0 && component.length > 1;
    const componentAngle = components.length <= 1
      ? -Math.PI / 2
      : (Math.PI * 2 * (componentIndex - 1)) / Math.max(1, components.length - 1) - Math.PI / 2;
    const componentDistance = isMain ? 0 : graphRadius * (0.42 + (componentIndex % 3) * 0.1);
    const componentCenterX = isMain ? centerX : centerX + Math.cos(componentAngle) * componentDistance;
    const componentCenterY = isMain ? centerY : centerY + Math.sin(componentAngle) * componentDistance;
    const componentRadius = component.length === 1
      ? 0
      : Math.min(190, Math.max(44, 22 + component.length * 12));

    component
      .slice()
      .sort((a, b) => (adjacency.get(b)?.size ?? 0) - (adjacency.get(a)?.size ?? 0))
      .forEach((id, index) => {
        const node = nodeById.get(id)!;
        if (component.length === 1) {
          placed.set(id, { ...node, x: componentCenterX, y: componentCenterY });
          return;
        }

        const angle = (Math.PI * 2 * index) / component.length - Math.PI / 2;
        const jitter = ((index * 37) % 17 - 8) * 2.2;
        const ringRadius = componentRadius + jitter;
        placed.set(id, {
          ...node,
          x: componentCenterX + Math.cos(angle) * ringRadius,
          y: componentCenterY + Math.sin(angle) * ringRadius,
        });
      });
  });

  return nodes.map(node => placed.get(node.id) ?? { ...node, x: centerX, y: centerY });
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.source}-${edge.target}-${edge.type}`;
}

function linkEndpointId(endpoint: ForceLink['source']): string {
  return typeof endpoint === 'object' ? endpoint.id : String(endpoint);
}

function nodeRadius(node: GraphNode, degree: number): number {
  return Math.min(5.6, 3.2 + degree * 0.42 + (node.noteCount ?? 0) * 0.24);
}

function GraphCanvas({
  nodes,
  edges,
  selectedId,
  mode,
  onSelect,
  onFocusNeighborhood,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  mode: GraphMode;
  onSelect: (node: GraphNode) => void;
  onFocusNeighborhood: (node: GraphNode) => void;
}) {
  const width = 900;
  const height = 620;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<SVGGElement | null>(null);
  const simulationRef = useRef<d3.Simulation<ForceNode, ForceLink> | null>(null);
  const nodeByIdRef = useRef(new Map<string, ForceNode>());
  const [forceNodes, setForceNodes] = useState<ForceNode[]>([]);
  const [forceLinks, setForceLinks] = useState<ForceLink[]>([]);
  const draggedRef = useRef(false);
  const degreeById = useMemo(() => {
    const degrees = new Map(nodes.map(node => [node.id, 0]));
    edges.forEach((edge) => {
      degrees.set(String(edge.source), (degrees.get(String(edge.source)) ?? 0) + 1);
      degrees.set(String(edge.target), (degrees.get(String(edge.target)) ?? 0) + 1);
    });
    return degrees;
  }, [edges, nodes]);
  const nodeById = useMemo(() => new Map(forceNodes.map(node => [node.id, node])), [forceNodes]);

  useEffect(() => {
    simulationRef.current?.stop();

    const forceNodeData: ForceNode[] = layoutNodes(nodes, edges, width, height).map(node => ({
      ...node,
      x: node.x ?? width / 2,
      y: node.y ?? height / 2,
      radius: nodeRadius(node, degreeById.get(node.id) ?? 0),
    }));
    const forceLinkData: ForceLink[] = edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      weight: edge.weight,
      evidence: edge.evidence,
      confidence: edge.confidence,
    }));

    nodeByIdRef.current = new Map(forceNodeData.map(node => [node.id, node]));
    setForceNodes(forceNodeData.map(node => ({ ...node })));
    setForceLinks(forceLinkData);

    const simulation = d3.forceSimulation<ForceNode>(forceNodeData)
      .force('link', d3.forceLink<ForceNode, ForceLink>(forceLinkData)
        .id(node => node.id)
        .distance(link => link.type === 'PREREQUISITE_OF' ? 118 : 94)
        .strength(0.42))
      .force('charge', d3.forceManyBody<ForceNode>().strength(-95).distanceMax(260))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.08))
      .force('collide', d3.forceCollide<ForceNode>().radius(node => node.radius + 16).strength(0.9).iterations(2))
      .force('x', d3.forceX<ForceNode>(width / 2).strength(0.018))
      .force('y', d3.forceY<ForceNode>(height / 2).strength(0.018))
      .alpha(1)
      .alphaMin(0.015)
      .alphaDecay(0.025)
      .velocityDecay(0.42)
      .on('tick', () => {
        forceNodeData.forEach((node) => {
          node.x = Math.max(24, Math.min(width - 24, node.x ?? width / 2));
          node.y = Math.max(24, Math.min(height - 42, node.y ?? height / 2));
        });
        setForceNodes(forceNodeData.map(node => ({ ...node })));
        setForceLinks(forceLinkData.map(link => ({ ...link })));
      });

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
      if (simulationRef.current === simulation) simulationRef.current = null;
    };
  }, [degreeById, edges, nodes]);

  useEffect(() => {
    const svg = svgRef.current;
    const simulation = simulationRef.current;
    if (!svg || !simulation) return;

    const dragBehavior = d3.drag<SVGGElement, unknown>()
      .clickDistance(3)
      .on('start', function start(event) {
        const id = this.dataset.nodeId;
        const node = id ? nodeByIdRef.current.get(id) : null;
        if (!node) return;
        draggedRef.current = false;
        if (!event.active) simulation.alphaTarget(0.32).restart();
        node.fx = node.x;
        node.fy = node.y;
      })
      .on('drag', function drag(event) {
        const id = this.dataset.nodeId;
        const node = id ? nodeByIdRef.current.get(id) : null;
        if (!node) return;
        draggedRef.current = true;
        node.fx = event.x;
        node.fy = event.y;
      })
      .on('end', function end(event) {
        const id = this.dataset.nodeId;
        const node = id ? nodeByIdRef.current.get(id) : null;
        if (!node) return;
        if (!event.active) simulation.alphaTarget(0);
        node.fx = null;
        node.fy = null;
      });

    d3.select(svg).selectAll<SVGGElement, unknown>('[data-node-id]').call(dragBehavior);
  }, [forceNodes]);

  useEffect(() => {
    const svg = svgRef.current;
    const viewport = viewportRef.current;
    if (!svg || !viewport || nodes.length === 0) return;

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 3.2])
      .filter(event => {
        if (event.type === 'dblclick') return false;
        return !event.target.closest?.('[data-node-id]');
      })
      .on('zoom', (event) => {
        d3.select(viewport).attr('transform', event.transform.toString());
      });

    d3.select(svg).call(zoomBehavior);
    return () => {
      d3.select(svg).on('.zoom', null);
    };
  }, [nodes.length]);

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
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="h-full w-full touch-none select-none bg-white">
      <defs>
        <filter id="node-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g ref={viewportRef}>
        {forceLinks.map((edge) => {
          const source = nodeById.get(linkEndpointId(edge.source));
          const target = nodeById.get(linkEndpointId(edge.target));
          if (!source || !target) return null;
          return (
            <g key={edge.id || `${linkEndpointId(edge.source)}-${linkEndpointId(edge.target)}-${edge.type}`}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={edge.type === 'PREREQUISITE_OF' ? '#d9b27c' : '#d7dce2'}
                strokeWidth={0.85}
                strokeOpacity={0.76}
              />
              <title>{edge.type}</title>
            </g>
          );
        })}

        {forceNodes.map((node) => {
          const selected = selectedId === node.id;
          const degree = degreeById.get(node.id) ?? 0;
          const focused = mode === 'neighborhood' && selected;
          const x = node.x ?? width / 2;
          const y = node.y ?? height / 2;
          return (
            <g
              key={node.id}
              data-node-id={node.id}
              onClick={() => {
                if (draggedRef.current) {
                  draggedRef.current = false;
                  return;
                }
                onSelect(node);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                onFocusNeighborhood(node);
              }}
              className="cursor-grab outline-none active:cursor-grabbing"
            >
              <circle
                cx={x}
                cy={y}
                r={node.radius}
                fill={node.isolated ? '#555b61' : focused ? '#2563eb' : degree > 2 ? '#3f454a' : '#b9c0c7'}
                stroke="#ffffff"
                strokeWidth={1}
                filter={selected ? 'url(#node-glow)' : undefined}
              />
              <text
                x={x}
                y={y + node.radius + 11}
                textAnchor="middle"
                className={`pointer-events-none text-[9px] ${selected ? 'fill-slate-700 font-medium' : 'fill-slate-500'}`}
              >
                {node.label.length > 14 ? `${node.label.slice(0, 13)}...` : node.label}
              </text>
              <title>{node.label}</title>
            </g>
          );
        })}
      </g>
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
  const [overview, setOverview] = useState<GraphOverview | null>(null);
  const [neighborhood, setNeighborhood] = useState<GraphData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
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

  useEffect(() => {
    if (!authLoading) loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, query, relationType, isolatedOnly, mode]);

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

  const focusNeighborhood = async (conceptId = selectedId) => {
    if (!conceptId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.graph.neighborhood(conceptId);
      setSelectedId(conceptId);
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

        <div className="relative min-h-0 flex-1">
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
              }}
              onFocusNeighborhood={(node) => focusNeighborhood(node.id)}
            />
          )}
          <GraphStatsPanel
            mode={mode}
            totalStats={overview?.stats}
            visibleNodeCount={visibleGraph?.nodes.length ?? 0}
            visibleEdgeCount={visibleGraph?.edges.length ?? 0}
            selectedLabel={detail?.concept.label ?? null}
          />
          <GraphToolbar
            query={query}
            relationType={relationType}
            isolatedOnly={isolatedOnly}
            stats={overview?.stats}
            onQueryChange={(value) => {
              setQuery(value);
              returnToOverview();
            }}
            onRelationTypeChange={(value) => {
              setRelationType(value);
              if (value === 'ALL') setIsolatedOnly(false);
              returnToOverview();
            }}
            onScopeChange={setScope}
            onReset={resetFilters}
          />
        </div>
      </main>

      <aside className="w-96 border-l border-gray-200 bg-white flex flex-col">
        <DetailPanel
          selectedId={selectedId}
          detail={detail}
          loading={detailLoading}
          onFocusNeighborhood={() => focusNeighborhood()}
        />
      </aside>
    </div>
  );
}

function GraphToolbar({
  query,
  relationType,
  isolatedOnly,
  stats,
  onQueryChange,
  onRelationTypeChange,
  onScopeChange,
  onReset,
}: {
  query: string;
  relationType: string;
  isolatedOnly: boolean;
  stats?: GraphOverview['stats'];
  onQueryChange: (value: string) => void;
  onRelationTypeChange: (value: string) => void;
  onScopeChange: (isolatedOnly: boolean) => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md border border-gray-200 bg-white/95 p-2 shadow-lg backdrop-blur">
      <label className="flex h-9 w-64 items-center gap-2 rounded border border-gray-200 px-2 text-sm">
        <Search size={15} className="text-gray-400" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索概念"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
        {query ? (
          <button type="button" onClick={() => onQueryChange('')} className="text-gray-400 hover:text-gray-700" title="清空搜索">
            <X size={14} />
          </button>
        ) : null}
      </label>

      <label className="flex h-9 items-center rounded border border-gray-200 px-2" title="关系类型">
        <Filter size={15} className="mr-1.5 text-gray-500" />
        <select
          value={relationType}
          onChange={(event) => onRelationTypeChange(event.target.value)}
          className="bg-transparent text-sm outline-none"
        >
          {RELATION_TYPES.map(type => (
            <option key={type} value={type}>{type === 'ALL' ? '全部关系' : type}</option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => onScopeChange(false)}
        title={`全部概念 ${stats?.conceptCount ?? 0}`}
        className={`inline-flex h-9 w-9 items-center justify-center rounded border ${
          !isolatedOnly ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <Network size={16} />
      </button>
      <button
        type="button"
        onClick={() => onScopeChange(true)}
        title={`只看孤立 ${stats?.isolatedCount ?? 0}`}
        className={`inline-flex h-9 w-9 items-center justify-center rounded border ${
          isolatedOnly ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <CircleDot size={16} />
      </button>
      <button
        type="button"
        onClick={onReset}
        title={`重置视图，关系 ${stats?.relationCount ?? 0}`}
        className="inline-flex h-9 w-9 items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
      >
        <RotateCcw size={16} />
      </button>
    </div>
  );
}

function GraphStatsPanel({
  mode,
  totalStats,
  visibleNodeCount,
  visibleEdgeCount,
  selectedLabel,
}: {
  mode: GraphMode;
  totalStats?: GraphOverview['stats'];
  visibleNodeCount: number;
  visibleEdgeCount: number;
  selectedLabel: string | null;
}) {
  return (
    <div className="absolute left-5 top-5 z-10 rounded-md border border-gray-200 bg-white/90 p-3 text-xs text-gray-600 shadow-sm backdrop-blur">
      <div className="mb-2 font-medium text-gray-900">{mode === 'neighborhood' ? '邻域统计' : '图谱统计'}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span>可见概念</span>
        <span className="text-right font-medium text-gray-900">{visibleNodeCount}</span>
        <span>可见关系</span>
        <span className="text-right font-medium text-gray-900">{visibleEdgeCount}</span>
        <span>总概念</span>
        <span className="text-right font-medium text-gray-900">{totalStats?.conceptCount ?? 0}</span>
        <span>孤立</span>
        <span className="text-right font-medium text-gray-900">{totalStats?.isolatedCount ?? 0}</span>
      </div>
      {selectedLabel ? (
        <div className="mt-2 max-w-44 truncate border-t border-gray-100 pt-2 text-gray-500" title={selectedLabel}>
          选中：{selectedLabel}
        </div>
      ) : null}
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
              <div className="text-sm text-gray-400">暂无相关卡片</div>
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

