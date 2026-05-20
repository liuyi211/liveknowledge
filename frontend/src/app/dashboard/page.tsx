'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import type { GraphHealth, ReviewStats } from '@/types';
import { Brain, GitBranch, Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [graphHealth, setGraphHealth] = useState<GraphHealth | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);

  useEffect(() => {
    async function load() {
      try {
        await api.auth.me();
      } catch {
        router.push('/login');
        return;
      }

      const [health, review] = await Promise.all([
        api.graph.health().catch(() => null),
        api.review.stats().catch(() => null),
      ]);
      setGraphHealth(health);
      setReviewStats(review);
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
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
      <main className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">仪表盘</h1>
            <p className="mt-1 text-sm text-gray-500">学习、复习和知识图谱的当前状态。</p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="概念" value={graphHealth?.conceptCount ?? 0} />
            <Metric label="关系" value={graphHealth?.relationCount ?? 0} />
            <Metric label="今日到期" value={reviewStats?.dueCount ?? 0} />
            <Metric label="今日已复习" value={reviewStats?.reviewedToday ?? 0} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-blue-600" />
                  <h2 className="text-lg font-semibold text-gray-900">图谱健康</h2>
                </div>
                <Link href="/graph" className="text-sm font-medium text-blue-700 hover:text-blue-800">打开图谱</Link>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-[180px_1fr]">
                <div className="rounded-lg bg-gray-900 p-5 text-white">
                  <div className="text-sm text-gray-300">健康分</div>
                  <div className="mt-2 text-5xl font-semibold">{graphHealth?.healthScore ?? 0}</div>
                </div>
                <div className="space-y-4">
                  <Progress label="卡片绑定率" value={graphHealth?.cardBindingRatio ?? 0} />
                  <Progress label="笔记绑定率" value={graphHealth?.noteBindingRatio ?? 0} />
                  <div className="grid grid-cols-3 gap-3">
                    <MiniMetric label="孤立概念" value={graphHealth?.isolatedConceptCount ?? 0} />
                    <MiniMetric label="待确认关系" value={graphHealth?.lowConfidenceRelationCount ?? 0} />
                    <MiniMetric label="未绑定卡片" value={graphHealth?.unboundCardCount ?? 0} />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-emerald-600" />
                <h2 className="text-lg font-semibold text-gray-900">复习状态</h2>
              </div>
              <div className="mt-5 space-y-3 text-sm">
                <Row label="新卡片" value={reviewStats?.groups?.newCount ?? 0} />
                <Row label="复习卡片" value={reviewStats?.groups?.reviewCount ?? 0} />
                <Row label="遗忘回炉" value={reviewStats?.groups?.lapsedCount ?? 0} />
                <Row label="7 天内负载" value={reviewStats?.upcoming.week ?? 0} />
              </div>
              <Link href="/review" className="mt-5 inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                进入复习
              </Link>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
