'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  GitBranch,
  Loader2,
  PauseCircle,
  Play,
  RotateCcw,
  Save,
  Tag,
  Timer,
} from 'lucide-react';
import { api } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import type { CardGraphContext, ReviewCard, ReviewFilters, ReviewStats } from '@/types';

type Rating = 1 | 2 | 3 | 4;
type ReviewMode = 'overview' | 'session' | 'summary';
type QueueFilter =
  | { type: 'all' }
  | { type: 'weak' }
  | { type: 'tag'; value: string }
  | { type: 'note'; value: string; label: string };

interface SessionResult {
  rating: Rating;
  responseTimeMs: number;
  intervalLabel: string;
}

const ratingButtons: Array<{
  rating: Rating;
  label: string;
  intervalKey: keyof ReviewCard['predictedIntervals'];
  hint: string;
  className: string;
}> = [
  { rating: 1, label: 'Again', intervalKey: 'again', hint: '忘记了', className: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' },
  { rating: 2, label: 'Hard', intervalKey: 'hard', hint: '勉强记得', className: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' },
  { rating: 3, label: 'Good', intervalKey: 'good', hint: '正常记得', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  { rating: 4, label: 'Easy', intervalKey: 'easy', hint: '很轻松', className: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100' },
];

export default function ReviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ReviewMode>('overview');
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [filters, setFilters] = useState<ReviewFilters>({ tags: [], notes: [] });
  const [qualityCards, setQualityCards] = useState<ReviewCard[]>([]);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>({ type: 'all' });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [ratedCurrentCard, setRatedCurrentCard] = useState(false);

  const currentCard = cards[currentIndex];
  const estimatedMinutes = Math.max(1, Math.ceil(cards.length * 0.4));
  const rememberedCount = results.filter((result) => result.rating > 1).length;
  const averageResponseSeconds = results.length
    ? Math.round(results.reduce((sum, result) => sum + result.responseTimeMs, 0) / results.length / 100) / 10
    : 0;

  const progressText = useMemo(() => {
    if (!cards.length) return '0 / 0';
    return `${Math.min(currentIndex + 1, cards.length)} / ${cards.length}`;
  }, [cards.length, currentIndex]);

  useEffect(() => {
    async function load() {
      try {
        await api.auth.me();
      } catch {
        router.push('/login');
        return;
      }

      try {
        const [dueResponse, statsResponse, filtersResponse, qualityResponse] = await Promise.all([
          api.review.due({ limit: 30 }),
          api.review.stats(),
          api.review.filters().catch(() => ({ tags: [], notes: [] })),
          api.review.quality({ limit: 20 }).catch(() => ({ cards: [] })),
        ]);
        setCards(dueResponse.cards);
        setStats(statsResponse);
        setFilters(filtersResponse);
        setQualityCards(qualityResponse.cards);
      } catch (err) {
        setError(err instanceof Error ? err.message : '复习数据加载失败');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const loadQueue = async (filter: QueueFilter) => {
    setQueueFilter(filter);
    setError(null);
    const params =
      filter.type === 'tag'
        ? { limit: 30, tag: filter.value }
        : filter.type === 'note'
        ? { limit: 30, noteId: filter.value }
        : filter.type === 'weak'
        ? { limit: 30, mode: 'weak' as const }
        : { limit: 30 };
    const response = await api.review.due(params);
    setCards(response.cards);
    setCurrentIndex(0);
    setResults([]);
    setRevealed(false);
    setRatedCurrentCard(false);
    setFeedback(null);
  };

  const refreshStats = async () => {
    try {
      setStats(await api.review.stats());
    } catch {
      // Stats are helpful, but the review flow should keep moving if they fail.
    }
  };

  const startSession = () => {
    setMode('session');
    setSessionStartedAt(Date.now());
    setStartedAt(Date.now());
    setCurrentIndex(0);
    setResults([]);
    setRevealed(false);
    setRatedCurrentCard(false);
    setFeedback(null);
    setError(null);
  };

  const returnToOverview = () => {
    setMode('overview');
    setRevealed(false);
    setFeedback(null);
    setError(null);
  };

  const handleRate = async (rating: Rating) => {
    if (!currentCard || submitting) return;
    const responseTimeMs = startedAt ? Date.now() - startedAt : 0;
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.review.rate(currentCard.id, { rating, responseTimeMs });
      const intervalLabel = response.feedback?.intervalLabel ?? currentCard.predictedIntervals.good;
      setResults((items) => [...items, { rating, responseTimeMs, intervalLabel }]);
      setFeedback(`已安排 ${intervalLabel} 后复习`);
      setRatedCurrentCard(true);
      refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : '评分失败');
    } finally {
      setSubmitting(false);
    }
  };

  const goToNextCard = () => {
    setFeedback(null);
    if (currentIndex + 1 >= cards.length) {
      setMode('summary');
      return;
    }
    setCurrentIndex((index) => index + 1);
    setRevealed(false);
    setRatedCurrentCard(false);
    setStartedAt(Date.now());
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
          <Header progressText={mode === 'session' ? progressText : undefined} />

          {loading ? (
            <div className="flex flex-1 items-center justify-center text-slate-500">加载中...</div>
          ) : mode === 'overview' ? (
            <Overview
              cards={cards}
              stats={stats}
              filters={filters}
              activeFilter={queueFilter}
              qualityCards={qualityCards}
              estimatedMinutes={estimatedMinutes}
              onStart={startSession}
              onFilterChange={loadQueue}
              onQualityCardsChange={setQualityCards}
            />
          ) : mode === 'summary' ? (
            <Summary
              total={results.length}
              remembered={rememberedCount}
              averageResponseSeconds={averageResponseSeconds}
              elapsedMinutes={sessionStartedAt ? Math.max(1, Math.round((Date.now() - sessionStartedAt) / 60000)) : 1}
              onRestart={startSession}
              onBack={returnToOverview}
              hasCards={cards.length > 0}
            />
          ) : (
            <Session
              card={currentCard}
              revealed={revealed}
              feedback={feedback}
              error={error}
              submitting={submitting}
              rated={ratedCurrentCard}
              isLastCard={currentIndex + 1 >= cards.length}
              onBack={returnToOverview}
              onReveal={() => setRevealed(true)}
              onRate={handleRate}
              onNext={goToNextCard}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function Header({ progressText }: { progressText?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">复习</h1>
        <p className="mt-1 text-sm text-slate-500">把今天该见的知识点，稳稳送回长期记忆。</p>
      </div>
      {progressText ? (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          <Timer className="h-4 w-4" />
          {progressText}
        </div>
      ) : null}
    </div>
  );
}

function Overview({
  cards,
  stats,
  filters,
  activeFilter,
  qualityCards,
  estimatedMinutes,
  onStart,
  onFilterChange,
  onQualityCardsChange,
}: {
  cards: ReviewCard[];
  stats: ReviewStats | null;
  filters: ReviewFilters;
  activeFilter: QueueFilter;
  qualityCards: ReviewCard[];
  estimatedMinutes: number;
  onStart: () => void;
  onFilterChange: (filter: QueueFilter) => void;
  onQualityCardsChange: (cards: ReviewCard[]) => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard icon={<Brain className="h-4 w-4" />} label="今日到期" value={stats?.dueCount ?? cards.length} />
        <StatCard icon={<Clock3 className="h-4 w-4" />} label="预计耗时" value={`${cards.length ? estimatedMinutes : 0} 分钟`} />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="今日已复习" value={stats?.reviewedToday ?? 0} />
        <StatCard
          icon={<RotateCcw className="h-4 w-4" />}
          label="今日正确率"
          value={stats?.accuracyToday == null ? '--' : `${Math.round(stats.accuracyToday * 100)}%`}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-900">今日复习队列</h2>
              <p className="mt-1 text-sm text-slate-500">
                {cards.length > 0 ? '开始后会进入专注模式，逐张完成评分。' : '现在没有到期卡片。'}
              </p>
            </div>
            <button
              onClick={onStart}
              disabled={cards.length === 0}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Play className="h-4 w-4" />
              开始复习
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <QueueMetric label="新卡片" value={stats?.groups?.newCount ?? 0} />
            <QueueMetric label="复习卡片" value={stats?.groups?.reviewCount ?? 0} />
            <QueueMetric label="遗忘回炉" value={stats?.groups?.lapsedCount ?? 0} />
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-2 text-sm font-medium text-slate-700">选择队列</div>
            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={activeFilter.type === 'all'}
                icon={<Brain className="h-3.5 w-3.5" />}
                label="全部到期"
                count={stats?.dueCount ?? cards.length}
                onClick={() => onFilterChange({ type: 'all' })}
              />
              <FilterButton
                active={activeFilter.type === 'weak'}
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                label="薄弱优先"
                count={stats?.weakCount ?? 0}
                onClick={() => onFilterChange({ type: 'weak' })}
              />
              {filters.tags.slice(0, 8).map((item) => (
                <FilterButton
                  key={item.tag}
                  active={activeFilter.type === 'tag' && activeFilter.value === item.tag}
                  icon={<Tag className="h-3.5 w-3.5" />}
                  label={item.tag}
                  count={item.count}
                  onClick={() => onFilterChange({ type: 'tag', value: item.tag })}
                />
              ))}
              {filters.notes.slice(0, 8).map((item) => (
                <FilterButton
                  key={item.noteId}
                  active={activeFilter.type === 'note' && activeFilter.value === item.noteId}
                  icon={<FileText className="h-3.5 w-3.5" />}
                  label={item.title}
                  count={item.count}
                  onClick={() => onFilterChange({ type: 'note', value: item.noteId, label: item.title })}
                />
              ))}
            </div>
          </div>
        </section>

        <QualityWorkbench cards={qualityCards} onCardsChange={onQualityCardsChange} compact />
      </div>

      <FutureTasks stats={stats} />
    </div>
  );
}

function QualityWorkbench({
  cards,
  onCardsChange,
  compact = false,
}: {
  cards: ReviewCard[];
  onCardsChange: (cards: ReviewCard[]) => void;
  compact?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ front: '', back: '' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (card: ReviewCard) => {
    setEditingId(card.id);
    setDraft({ front: card.front, back: card.back });
    setError(null);
  };

  const removeCard = (cardId: string) => {
    onCardsChange(cards.filter((card) => card.id !== cardId));
  };

  const saveCard = async (card: ReviewCard) => {
    setBusyId(card.id);
    setError(null);
    try {
      await api.review.updateCard(card.id, draft);
      removeCard(card.id);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusyId(null);
    }
  };

  const markReviewed = async (card: ReviewCard) => {
    setBusyId(card.id);
    setError(null);
    try {
      await api.review.markQualityReviewed(card.id);
      removeCard(card.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '标记失败');
    } finally {
      setBusyId(null);
    }
  };

  const suspendCard = async (card: ReviewCard) => {
    setBusyId(card.id);
    setError(null);
    try {
      await api.review.suspendCard(card.id);
      removeCard(card.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '暂停失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={`${compact ? '' : 'mt-6'} rounded-lg border border-slate-200 bg-white p-5 shadow-sm`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={compact ? 'text-base font-semibold text-slate-900' : 'text-lg font-semibold text-slate-900'}>坏卡片改写</h2>
          <p className="mt-1 text-sm text-slate-500">
            {compact ? '连续遗忘 3 次以上的卡片，优先拆分或补充上下文。' : '连续遗忘 3 次以上的卡片会出现在这里，优先检查是否需要拆分、补充上下文或暂停。'}
          </p>
        </div>
        <div className="rounded-md bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800">{cards.length} 张待处理</div>
      </div>

      {error ? <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {cards.length === 0 ? (
        <div className="mt-6 rounded-md bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          暂无需要改写的卡片。
        </div>
      ) : (
        <div className={compact ? 'mt-5 space-y-3' : 'mt-5 space-y-4'}>
          {cards.slice(0, compact ? 2 : cards.length).map((card) => {
            const isEditing = editingId === card.id;
            const busy = busyId === card.id;
            return (
              <article key={card.id} className="rounded-md border border-slate-200 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-slate-500">
                    {card.noteTitle || '未关联笔记'} · 遗忘 {card.lapseCount} 次
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isEditing ? (
                      <button
                        onClick={() => saveCard(card)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        <Save className="h-3.5 w-3.5" />
                        保存
                      </button>
                    ) : (
                      <button
                        onClick={() => startEdit(card)}
                        disabled={busy}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        改写
                      </button>
                    )}
                    <button
                      onClick={() => markReviewed(card)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Check className="h-3.5 w-3.5" />
                      已处理
                    </button>
                    <button
                      onClick={() => suspendCard(card)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <PauseCircle className="h-3.5 w-3.5" />
                      暂停
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">问题</span>
                      <textarea
                        value={draft.front}
                        onChange={(event) => setDraft((value) => ({ ...value, front: event.target.value }))}
                        className="h-24 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 focus:border-slate-400 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">答案</span>
                      <textarea
                        value={draft.back}
                        onChange={(event) => setDraft((value) => ({ ...value, back: event.target.value }))}
                        className="h-32 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 focus:border-slate-400 focus:outline-none"
                      />
                    </label>
                  </div>
                ) : compact ? (
                  <div className="space-y-3">
                    <div className="rounded-md bg-slate-50 px-3 py-3">
                      <div className="mb-1 text-xs font-medium text-slate-500">问题</div>
                      <p className="line-clamp-3 text-sm leading-6 text-slate-800">{card.front}</p>
                    </div>
                    <div className="text-xs leading-5 text-slate-500">
                      建议：如果问题过宽或答案过长，拆成更小的卡片。
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-md bg-slate-50 px-3 py-3">
                      <div className="mb-1 text-xs font-medium text-slate-500">问题</div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{card.front}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 px-3 py-3">
                      <div className="mb-1 text-xs font-medium text-slate-500">答案</div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{card.back}</p>
                    </div>
                  </div>
                )}

                {card.noteSummary ? (
                  <div className="mt-3 text-sm leading-6 text-slate-500">{compact ? `来源：${card.noteTitle || '未关联笔记'}` : `来源摘要：${card.noteSummary}`}</div>
                ) : null}
                {!compact ? <CardGraphContextPanel cardId={card.id} compact /> : null}
              </article>
            );
          })}
          {compact && cards.length > 2 ? (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
              还有 {cards.length - 2} 张待处理，完成前两张后会继续显示。
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function FutureTasks({ stats }: { stats: ReviewStats | null }) {
  const load = stats?.dailyLoad ?? [];
  const max = Math.max(...load.map((item) => item.count), 1);
  const total = load.reduce((sum, item) => sum + item.count, 0);
  const riskTotal = load.reduce((sum, item) => sum + (item.riskCount ?? 0), 0);
  const peak = load.reduce<typeof load[number] | null>((current, item) => {
    if (!current || item.count > current.count) return item;
    return current;
  }, null);

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">未来任务</h2>
          <p className="mt-1 text-sm text-slate-500">按 SSP-MMC 的下次复习时间预测未来 7 天任务量。</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <MiniLoadStat label="7 天内" value={`${stats?.upcoming.week ?? total} 张`} />
          <MiniLoadStat label="高风险" value={`${riskTotal} 张`} />
          <MiniLoadStat label="峰值" value={peak ? formatLoadDate(peak.date) : '--'} />
        </div>
      </div>

      {load.length ? (
        <div className="mt-6 grid h-64 grid-cols-7 items-end gap-3">
          {load.map((item, index) => (
            <FutureTaskBar key={item.date} item={item} max={max} isToday={index === 0} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-md bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          暂无未来任务数据。
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <Legend color="bg-slate-900" label="今日 / 新卡" />
        <Legend color="bg-blue-600" label="复习卡" />
        <Legend color="bg-amber-500" label="遗忘回炉" />
        <Legend color="bg-red-500" label="高风险标记" />
      </div>
    </section>
  );
}

function FutureTaskBar({
  item,
  max,
  isToday,
}: {
  item: NonNullable<ReviewStats['dailyLoad']>[number];
  max: number;
  isToday: boolean;
}) {
  const height = Math.max(10, Math.round((item.count / max) * 190));
  const newCount = item.newCount ?? 0;
  const reviewCount = item.reviewCount ?? Math.max(0, item.count - newCount - (item.lapsedCount ?? 0));
  const lapsedCount = item.lapsedCount ?? 0;
  const riskCount = item.riskCount ?? 0;

  return (
    <div className="flex h-full min-w-0 flex-col items-center justify-end">
      <div className="mb-2 h-5 text-xs font-medium text-red-600">{riskCount > 0 ? riskCount : ''}</div>
      <div className="mb-2 text-sm font-semibold text-slate-900">{item.count}</div>
      <div className="flex h-48 w-full items-end justify-center">
        <div
          className="flex w-full max-w-16 flex-col justify-end overflow-hidden rounded-md bg-slate-100"
          style={{ height }}
          title={`${formatLoadDate(item.date)}：${item.count} 张，高风险 ${riskCount} 张`}
        >
          <Segment count={lapsedCount} total={item.count} color="bg-amber-500" minHeight={lapsedCount > 0 ? 8 : 0} />
          <Segment count={reviewCount} total={item.count} color="bg-blue-600" minHeight={reviewCount > 0 ? 8 : 0} />
          <Segment count={newCount} total={item.count} color={isToday ? 'bg-slate-900' : 'bg-slate-600'} minHeight={newCount > 0 ? 8 : 0} />
        </div>
      </div>
      <div className={`mt-3 truncate text-xs ${isToday ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
        {formatLoadDate(item.date)}
      </div>
    </div>
  );
}

function Segment({ count, total, color, minHeight }: { count: number; total: number; color: string; minHeight: number }) {
  if (count <= 0 || total <= 0) return null;
  return <div className={color} style={{ height: `max(${minHeight}px, ${(count / total) * 100}%)` }} />;
}

function MiniLoadStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </div>
  );
}

function Session({
  card,
  revealed,
  feedback,
  error,
  submitting,
  rated,
  isLastCard,
  onReveal,
  onRate,
  onBack,
  onNext,
}: {
  card: ReviewCard | undefined;
  revealed: boolean;
  feedback: string | null;
  error: string | null;
  submitting: boolean;
  rated: boolean;
  isLastCard: boolean;
  onBack: () => void;
  onReveal: () => void;
  onRate: (rating: Rating) => void;
  onNext: () => void;
}) {
  if (!card) return null;

  return (
    <section className="flex flex-1 items-center justify-center">
      <div className="grid w-full gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <BookOpen className="h-4 w-4" />
                  {card.noteTitle || '未关联笔记'}
                </div>
                <div className="text-xs text-slate-400">
                  {statusLabel(card.dueStatus)} · 难度 {card.difficulty.toFixed(1)} · 半衰期 {card.halfLife.toFixed(1)} 天
                </div>
              </div>
            </div>
            <div className="min-h-48 px-6 py-8">
              <p className="whitespace-pre-wrap text-lg leading-8 text-slate-900">{card.front}</p>
            </div>

            {revealed ? (
              <div className="border-t border-slate-100 px-6 py-6">
                <div className="mb-3 text-sm font-medium text-slate-500">答案</div>
                <p className="whitespace-pre-wrap text-base leading-7 text-slate-800">{card.back}</p>
                {card.noteSummary ? (
                  <div className="mt-5 rounded-md bg-slate-50 px-4 py-3">
                    <div className="mb-1 text-xs font-medium text-slate-500">来源摘要</div>
                    <p className="text-sm leading-6 text-slate-700">{card.noteSummary}</p>
                    {card.noteId ? (
                      <Link href={`/notes?noteId=${card.noteId}`} className="mt-3 inline-flex text-sm font-medium text-slate-900 hover:text-blue-700">
                        打开来源笔记
                      </Link>
                    ) : null}
                  </div>
                ) : card.noteId ? (
                  <Link href={`/notes?noteId=${card.noteId}`} className="mt-5 inline-flex text-sm font-medium text-slate-900 hover:text-blue-700">
                    打开来源笔记
                  </Link>
                ) : null}
                {card.lapseCount >= 3 ? (
                  <div className="mt-5 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    这张卡片已经多次遗忘，后续可以考虑把问题拆小或改写答案。
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {feedback ? <div className="mt-4 rounded-md bg-slate-900 px-4 py-3 text-sm text-white">{feedback}</div> : null}
          {error ? <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          <div className="mt-5">
            {!revealed ? (
              <button
                onClick={onReveal}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Eye className="h-4 w-4" />
                显示答案
              </button>
            ) : (
              <div className="grid gap-3 sm:grid-cols-4">
                {ratingButtons.map((button) => (
                  <button
                    key={button.rating}
                    onClick={() => onRate(button.rating)}
                    disabled={submitting || rated}
                    className={`rounded-md border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${button.className}`}
                  >
                    <div className="font-semibold">{button.label}</div>
                    <div className="mt-1 text-xs opacity-80">{button.hint}</div>
                    <div className="mt-2 text-xs font-medium">约 {card.predictedIntervals[button.intervalKey]} 后</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              返回复习主页
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!rated}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isLastCard ? '完成本轮' : '下一张卡片'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <CardGraphContextPanel cardId={card.id} />
      </div>
    </section>
  );
}

function CardGraphContextPanel({ cardId, compact = false }: { cardId: string; compact?: boolean }) {
  const [context, setContext] = useState<CardGraphContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.graph.cardContext(cardId)
      .then((data: CardGraphContext) => {
        if (!cancelled) setContext(data);
      })
      .catch(() => {
        if (!cancelled) setContext(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const hasContext = Boolean(
    context &&
    (context.concepts.length || context.prerequisites.length || context.related.length || context.notes.length)
  );

  return (
    <aside className={`${compact ? 'mt-4' : ''} rounded-lg border border-slate-200 bg-white p-4 shadow-sm`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <GitBranch className="h-4 w-4" />
        相关知识
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载图谱上下文
        </div>
      ) : !hasContext ? (
        <div className="mt-4 rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
          暂无图谱上下文。后续可以通过提炼采纳或索引同步来补齐。
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <ContextSection title="考察概念" items={context?.concepts ?? []} />
          <ContextSection title="前置知识" items={context?.prerequisites ?? []} />
          <ContextSection title="相关概念" items={context?.related ?? []} />
          {context?.notes.length ? (
            <div>
              <div className="mb-2 text-xs font-medium text-slate-500">关联笔记</div>
              <div className="space-y-2">
                {context.notes.map(note => (
                  <Link key={note.id} href={`/notes?noteId=${note.id}`} className="block rounded-md bg-slate-50 px-3 py-2 hover:bg-slate-100">
                    <div className="text-sm font-medium text-slate-800">{note.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{note.summary}</div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}

function ContextSection({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; label: string; description: string | null; confidence: number }>;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-slate-500">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <Link
            key={item.id}
            href="/graph"
            title={item.description || item.label}
            className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Summary({
  total,
  remembered,
  averageResponseSeconds,
  elapsedMinutes,
  onRestart,
  onBack,
  hasCards,
}: {
  total: number;
  remembered: number;
  averageResponseSeconds: number;
  elapsedMinutes: number;
  onRestart: () => void;
  onBack: () => void;
  hasCards: boolean;
}) {
  const accuracy = total > 0 ? Math.round((remembered / total) * 100) : 0;

  return (
    <div className="flex flex-1 items-center justify-center">
      <section className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">本轮复习完成</h2>
        <p className="mt-2 text-sm text-slate-500">这轮记忆数据已经写入调度系统。</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-4">
          <QueueMetric label="完成" value={total} />
          <QueueMetric label="记住" value={remembered} />
          <QueueMetric label="正确率" value={`${accuracy}%`} />
          <QueueMetric label="平均反应" value={`${averageResponseSeconds}s`} />
        </div>
        <div className="mt-4 text-sm text-slate-500">用时约 {elapsedMinutes} 分钟</div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            返回复习主页
          </button>
          <button
            onClick={onRestart}
            disabled={!hasCards}
            className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            再复习一轮
          </button>
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function QueueMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function FilterButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition ${
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
      }`}
      title={label}
    >
      {icon}
      <span className="max-w-40 truncate">{label}</span>
      <span className={active ? 'text-slate-200' : 'text-slate-400'}>{count}</span>
    </button>
  );
}

function LoadRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value} 张</span>
    </div>
  );
}

function LoadBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = `${Math.max(4, Math.round((value / max) * 100))}%`;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-700" style={{ width }} />
      </div>
    </div>
  );
}

function formatLoadDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((parsed.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '明天';
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}

function statusLabel(status: ReviewCard['dueStatus']): string {
  const labels = {
    new: '新卡片',
    learning: '学习中',
    review: '复习',
    lapsed: '遗忘回炉',
  };
  return labels[status];
}
