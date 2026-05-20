'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import type { GraphHealth, Note, ReviewCard, ReviewStats } from '@/types';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  Flame,
  GitBranch,
  Loader2,
  NotebookText,
  Sparkles,
} from 'lucide-react';

type ReviewQualityResponse = { cards: ReviewCard[] };

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [graphHealth, setGraphHealth] = useState<GraphHealth | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [qualityCards, setQualityCards] = useState<ReviewCard[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        await api.auth.me();
      } catch {
        router.push('/login');
        return;
      }

      const [health, review, quality, notes, sessions] = await Promise.all([
        api.graph.health().catch(() => null),
        api.review.stats().catch(() => null),
        api.review.quality({ limit: 5 }).catch(() => ({ cards: [] })),
        api.notes.list().catch(() => []),
        api.sessions.list({ limit: 5 }).catch(() => []),
      ]);

      setGraphHealth(health);
      setReviewStats(review);
      setQualityCards((quality as ReviewQualityResponse).cards ?? []);
      setRecentNotes(Array.isArray(notes) ? notes.slice(0, 5) : []);
      setSessionCount(Array.isArray(sessions) ? sessions.length : 0);
      setLoading(false);
    }
    load();
  }, [router]);

  const nextActions = useMemo(() => {
    const actions = [];
    if ((reviewStats?.dueCount ?? 0) > 0) {
      actions.push({
        title: `复习 ${reviewStats?.dueCount ?? 0} 张到期卡片`,
        description: '先清空今天的记忆队列。',
        href: '/review',
        tone: 'dark' as const,
      });
    }
    if ((reviewStats?.rewriteSuggestedCount ?? 0) > 0) {
      actions.push({
        title: `处理 ${reviewStats?.rewriteSuggestedCount ?? 0} 张高遗忘卡片`,
        description: '这些卡片可能需要改写或拆分。',
        href: '/review?mode=quality',
        tone: 'amber' as const,
      });
    }
    if ((graphHealth?.isolatedConceptCount ?? 0) > 0) {
      actions.push({
        title: `连接 ${graphHealth?.isolatedConceptCount ?? 0} 个孤立概念`,
        description: '让知识点进入可探索的网络。',
        href: '/graph',
        tone: 'blue' as const,
      });
    }
    if (actions.length === 0) {
      actions.push({
        title: '继续一次新的学习会话',
        description: '用对话补充材料，再提炼成笔记和卡片。',
        href: '/chat',
        tone: 'emerald' as const,
      });
    }
    return actions.slice(0, 3);
  }, [graphHealth, reviewStats]);

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
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-8 py-7">
          <header className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">仪表盘</h1>
              <p className="mt-1 text-sm text-gray-500">学习、复习和知识图谱的当前状态。</p>
            </div>
            <div className="flex gap-2">
              <Link href="/review" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                开始复习
              </Link>
              <Link href="/graph" className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                打开图谱
              </Link>
            </div>
          </header>

          <section className="grid gap-4 md:grid-cols-4">
            <MetricCard icon={Brain} label="今日到期" value={reviewStats?.dueCount ?? 0} hint="等待复习的卡片" />
            <MetricCard icon={CheckCircle2} label="今日已复习" value={reviewStats?.reviewedToday ?? 0} hint={formatAccuracy(reviewStats?.accuracyToday)} />
            <MetricCard icon={NotebookText} label="笔记" value={graphHealth?.noteCount ?? 0} hint={`${graphHealth?.boundNoteCount ?? 0} 篇已绑定图谱`} />
            <MetricCard icon={GitBranch} label="概念 / 关系" value={`${graphHealth?.conceptCount ?? 0}/${graphHealth?.relationCount ?? 0}`} hint={`健康分 ${graphHealth?.healthScore ?? 0}`} />
          </section>

          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <Panel title="今日学习队列" icon={Flame}>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <QueueTile label="新卡" value={reviewStats?.groups?.newCount ?? 0} />
                    <QueueTile label="复习卡" value={reviewStats?.groups?.reviewCount ?? 0} />
                    <QueueTile label="遗忘回炉" value={reviewStats?.groups?.lapsedCount ?? 0} />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <ActionLink href="/review" title="进入复习" description="按 SSP-MMC 顺序处理到期卡片。" />
                    <ActionLink href="/review?mode=weak" title="查看薄弱卡片" description={`${reviewStats?.weakCount ?? 0} 张卡片有遗忘记录。`} />
                  </div>
                </Panel>

                <Panel title="未来负载" icon={BarChart3}>
                  <DailyLoadChart data={reviewStats?.dailyLoad ?? []} />
                  <div className="mt-4 space-y-2 text-sm">
                    <InfoRow label="明天到期" value={reviewStats?.upcoming.tomorrow ?? 0} />
                    <InfoRow label="本周到期" value={reviewStats?.upcoming.week ?? 0} />
                  </div>
                </Panel>
              </section>

              <Panel title="最近知识增长" icon={BookOpen}>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="mb-3 text-sm font-medium text-gray-800">最近笔记</div>
                    <div className="space-y-2">
                      {recentNotes.length ? recentNotes.map(note => (
                        <Link key={note.id} href={`/notes?noteId=${note.id}`} className="block rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                          <div className="truncate text-sm font-medium text-gray-900">{note.title}</div>
                          <div className="mt-1 text-xs text-gray-500">{formatDate(note.updatedAt)}</div>
                        </Link>
                      )) : <EmptyState text="还没有笔记。" />}
                    </div>
                  </div>
                  <div>
                    <div className="mb-3 text-sm font-medium text-gray-800">学习活动</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <MiniStat label="会话" value={sessionCount} />
                      <MiniStat label="卡片" value={graphHealth?.cardCount ?? 0} />
                      <MiniStat label="绑定卡片" value={graphHealth?.boundCardCount ?? 0} />
                      <MiniStat label="关系密度" value={graphHealth?.relationDensity.toFixed(2) ?? '0.00'} />
                    </div>
                  </div>
                </div>
              </Panel>
            </div>

            <aside className="space-y-5">
              <Panel title="知识图谱健康" icon={GitBranch}>
                <div className="rounded-md bg-gray-900 p-4 text-white">
                  <div className="text-sm text-gray-300">健康分</div>
                  <div className="mt-2 text-5xl font-semibold">{graphHealth?.healthScore ?? 0}</div>
                </div>
                <div className="mt-4 space-y-3">
                  <Progress label="卡片绑定率" value={graphHealth?.cardBindingRatio ?? 0} />
                  <Progress label="笔记绑定率" value={graphHealth?.noteBindingRatio ?? 0} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <MiniStat label="孤立" value={graphHealth?.isolatedConceptCount ?? 0} />
                  <MiniStat label="待确认" value={graphHealth?.lowConfidenceRelationCount ?? 0} />
                  <MiniStat label="未绑卡" value={graphHealth?.unboundCardCount ?? 0} />
                </div>
              </Panel>

              <Panel title="待处理问题" icon={AlertTriangle}>
                <ChecklistItem label="高遗忘卡片" value={reviewStats?.rewriteSuggestedCount ?? qualityCards.length} href="/review?mode=quality" />
                <ChecklistItem label="孤立概念" value={graphHealth?.isolatedConceptCount ?? 0} href="/graph" />
                <ChecklistItem label="低置信关系" value={graphHealth?.lowConfidenceRelationCount ?? 0} href="/graph" />
                <ChecklistItem label="未绑定卡片" value={graphHealth?.unboundCardCount ?? 0} href="/review" />
              </Panel>

              <Panel title="下一步建议" icon={Sparkles}>
                <div className="space-y-3">
                  {nextActions.map(action => (
                    <Link key={action.title} href={action.href} className="block rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">{action.title}</div>
                          <div className="mt-1 text-xs leading-5 text-gray-500">{action.description}</div>
                        </div>
                        <ArrowRight size={16} className="shrink-0 text-gray-400" />
                      </div>
                    </Link>
                  ))}
                </div>
              </Panel>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, hint }: { icon: typeof Brain; label: string; value: number | string; hint: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">{label}</div>
        <Icon size={18} className="text-gray-400" />
      </div>
      <div className="mt-2 text-3xl font-semibold text-gray-900">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{hint}</div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Brain; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={18} className="text-gray-500" />
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function QueueTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-gray-50 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function ActionLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="rounded-md border border-gray-200 p-3 hover:bg-gray-50">
      <div className="text-sm font-medium text-gray-900">{title}</div>
      <div className="mt-1 text-xs leading-5 text-gray-500">{description}</div>
    </Link>
  );
}

function DailyLoadChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const max = Math.max(1, ...data.map(item => item.count));
  return (
    <div className="flex h-36 items-end gap-2">
      {data.length ? data.map(item => (
        <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-24 w-full items-end rounded bg-gray-50">
            <div
              className="w-full rounded bg-blue-600"
              style={{ height: `${Math.max(6, (item.count / max) * 96)}px` }}
              title={`${item.date}: ${item.count}`}
            />
          </div>
          <div className="text-[11px] text-gray-400">{item.date.slice(5)}</div>
        </div>
      )) : <EmptyState text="暂无未来负载数据。" />}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function ChecklistItem({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-gray-50">
      <span className="text-gray-600">{label}</span>
      <span className={value > 0 ? 'font-medium text-amber-700' : 'font-medium text-emerald-700'}>{value}</span>
    </Link>
  );
}

function InfoRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md bg-gray-50 px-3 py-4 text-sm text-gray-500">{text}</div>;
}

function formatAccuracy(value: number | null | undefined) {
  if (value == null) return '今天还没有复习';
  return `正确率 ${Math.round(value * 100)}%`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
