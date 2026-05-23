'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, BookOpen, Brain, Flame, Loader2, NotebookText } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { api } from '@/lib/api';
import type { CognitiveProfileSummary, GraphHealth, Note, ProfileOverview, ReviewStats } from '@/types';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [graphHealth, setGraphHealth] = useState<GraphHealth | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [profileSummary, setProfileSummary] = useState<CognitiveProfileSummary | null>(null);

  useEffect(() => {
    async function load() {
      try {
        await api.auth.me();
      } catch {
        router.push('/login');
        return;
      }

      const [health, review, notes, sessions, profile] = await Promise.all([
        api.graph.health().catch(() => null),
        api.review.stats().catch(() => null),
        api.notes.list().catch(() => []),
        api.sessions.list({ limit: 5 }).catch(() => []),
        api.profile.get().catch(() => null),
      ]);

      setGraphHealth(health as GraphHealth | null);
      setReviewStats(review as ReviewStats | null);
      setRecentNotes(Array.isArray(notes) ? notes.slice(0, 4) : []);
      setSessionCount(Array.isArray(sessions) ? sessions.length : 0);
      setProfileSummary((profile as ProfileOverview | null)?.summary ?? null);
      setLoading(false);
    }

    load();
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center bg-gray-50">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-8 py-7">
          <header className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">仪表盘</h1>
              <p className="mt-1 text-sm text-gray-500">聚焦今天要做的学习动作和最近的知识变化。</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link href="/review" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                开始复习
              </Link>
              <Link href="/graph" className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                打开图谱
              </Link>
            </div>
          </header>

          <section className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
            <MetricPanel
              icon={NotebookText}
              label="笔记数量"
              value={graphHealth?.noteCount ?? 0}
              hint={`${graphHealth?.boundNoteCount ?? 0} 篇已绑定图谱`}
            />
            <TodayQueue stats={reviewStats} />
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <RecentGrowth
              notes={recentNotes}
              sessionCount={sessionCount}
              cardCount={graphHealth?.cardCount ?? 0}
              boundCardCount={graphHealth?.boundCardCount ?? 0}
            />
            <CognitiveSummaryCard summary={profileSummary} />
          </section>
        </div>
      </main>
    </div>
  );
}

function MetricPanel({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof NotebookText;
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-500">{label}</div>
        <Icon size={18} className="text-gray-400" />
      </div>
      <div className="mt-4 text-4xl font-semibold text-gray-900">{value}</div>
      <div className="mt-2 text-sm text-gray-500">{hint}</div>
    </section>
  );
}

function TodayQueue({ stats }: { stats: ReviewStats | null }) {
  const newCount = stats?.groups?.newCount ?? 0;
  const reviewCount = stats?.groups?.reviewCount ?? 0;
  const lapsedCount = stats?.groups?.lapsedCount ?? 0;
  const total = stats?.dueCount ?? newCount + reviewCount + lapsedCount;
  const suggestion = total > 0
    ? `下一步：复习 ${total} 张到期卡片`
    : '下一步：今天没有到期卡片，可以继续整理笔记';

  return (
    <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Flame size={18} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900">今日学习队列</h2>
        </div>
        <Link href="/review" className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-950">
          进入复习
          <ArrowRight size={15} />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <QueueStat label="新卡" value={newCount} />
        <QueueStat label="复习卡" value={reviewCount} />
        <QueueStat label="遗忘回炉" value={lapsedCount} />
      </div>

      <div className="mt-4 rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-600">{suggestion}</div>
    </section>
  );
}

function QueueStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-gray-50 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function RecentGrowth({
  notes,
  sessionCount,
  cardCount,
  boundCardCount,
}: {
  notes: Note[];
  sessionCount: number;
  cardCount: number;
  boundCardCount: number;
}) {
  return (
    <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <BookOpen size={18} className="text-gray-500" />
        <h2 className="font-semibold text-gray-900">最近知识增长</h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <div className="mb-3 text-sm font-medium text-gray-800">最近笔记</div>
          <div className="space-y-2">
            {notes.length ? notes.map(note => (
              <Link key={note.id} href={`/notes?noteId=${note.id}`} className="block rounded-md border border-gray-200 px-3 py-2 hover:bg-gray-50">
                <div className="truncate text-sm font-medium text-gray-900">{note.title}</div>
                <div className="mt-1 text-xs text-gray-500">{formatDate(note.updatedAt)}</div>
              </Link>
            )) : <EmptyState text="还没有最近笔记。" />}
          </div>
        </div>

        <div>
          <div className="mb-3 text-sm font-medium text-gray-800">学习活动</div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <MiniStat label="会话" value={sessionCount} />
            <MiniStat label="卡片" value={cardCount} />
            <MiniStat label="绑定卡片" value={boundCardCount} />
          </div>
        </div>
      </div>
    </section>
  );
}

function CognitiveSummaryCard({ summary }: { summary: CognitiveProfileSummary | null }) {
  return (
    <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900">认知画像摘要</h2>
        </div>
        <Link href="/settings?tab=profile" className="text-sm font-medium text-gray-700 hover:text-gray-950">
          查看完整画像
        </Link>
      </div>

      {!summary ? (
        <EmptyState text="画像摘要暂不可用。" />
      ) : (
        <div className="space-y-4">
          {summary.status === 'forming' && (
            <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
              画像正在形成中，当前判断会随着复习和对话继续更新。
            </div>
          )}
          <SummaryRow label="薄弱点" value={summary.weakness} />
          <SummaryRow label="学习偏好" value={summary.preference} />
          <SummaryRow label="记忆状态" value={summary.memoryStatus} />
          <SummaryRow label="建议" value={summary.suggestion} />
          <div className="border-t border-gray-100 pt-3 text-xs leading-5 text-gray-500">{summary.evidence}</div>
        </div>
      )}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-sm leading-6 text-gray-900">{value}</div>
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

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md bg-gray-50 px-3 py-4 text-sm text-gray-500">{text}</div>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
