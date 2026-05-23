'use client';

import { useEffect, useState } from 'react';
import { Brain, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import type { DomainMastery, ProfileOverview, UserProfile, WeakPoint } from '@/types';

export default function CognitiveProfileSettings() {
  const [overview, setOverview] = useState<ProfileOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      const profile = await api.profile.get();
      setOverview(profile as ProfileOverview);
    } catch (err) {
      setError((err as Error).message || '加载认知画像失败');
    } finally {
      setLoading(false);
    }
  }

  async function refreshProfile() {
    setRefreshing(true);
    setError(null);
    try {
      const profile = await api.profile.recompute();
      setOverview(profile as ProfileOverview);
    } catch (err) {
      setError((err as Error).message || '画像重算失败');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  if (loading) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Brain size={20} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">认知画像</h2>
        </div>
        <div className="mt-4 text-sm text-gray-500">加载中...</div>
      </section>
    );
  }

  const profile = overview?.profile;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Brain size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">认知画像</h2>
          </div>
          <button
            type="button"
            onClick={refreshProfile}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            重算
          </button>
        </div>

        {error ? (
          <EmptyState text={error} />
        ) : !profile ? (
          <EmptyState text="画像数据暂不可用。" />
        ) : (
          <div className="space-y-6">
            {overview?.summary && (
              <div className="rounded-md bg-gray-50 p-4">
                <div className="mb-3 text-sm font-medium text-gray-800">摘要</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SummaryItem label="薄弱点" value={overview.summary.weakness} />
                  <SummaryItem label="学习偏好" value={overview.summary.preference} />
                  <SummaryItem label="记忆状态" value={overview.summary.memoryStatus} />
                  <SummaryItem label="建议" value={overview.summary.suggestion} />
                </div>
              </div>
            )}

            <ProfileStats profile={profile} />
            <StyleSection profile={profile} />
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <DomainMasteryPanel domains={overview?.domainMastery ?? []} />
        <WeakPointPanel weakPoints={overview?.weakPoints ?? []} />
      </section>
    </div>
  );
}

function ProfileStats({ profile }: { profile: UserProfile }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MiniStat label="偏好难度" value={profile.preferredDifficulty.toFixed(1)} />
      <MiniStat label="专注窗口" value={`${profile.attentionSpan} 分钟`} />
      <MiniStat label="稳定因子" value={profile.memoryStabilityFactor.toFixed(2)} />
      <MiniStat label="提取阈值" value={`${Math.round(profile.memoryRetrievabilityThreshold * 100)}%`} />
    </div>
  );
}

function StyleSection({ profile }: { profile: UserProfile }) {
  return (
    <div>
      <div className="mb-3 text-sm font-medium text-gray-800">学习风格</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StyleGauge label="视觉偏好" value={profile.styleVisual} left="文本" right="视觉" />
        <StyleGauge label="解释偏好" value={profile.styleIntuitive} left="形式" right="直觉" />
        <StyleGauge label="推进节奏" value={profile.styleGradual} left="跳跃" right="渐进" />
        <StyleGauge label="回答长度" value={profile.styleConcise} left="详实" right="简洁" />
      </div>
    </div>
  );
}

function DomainMasteryPanel({ domains }: { domains: DomainMastery[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-base font-semibold text-gray-900">领域熟练度</h3>
      {domains.length ? (
        <div className="space-y-4">
          {domains.slice(0, 6).map(domain => (
            <DomainRow key={domain.id} domain={domain} />
          ))}
        </div>
      ) : (
        <EmptyState text="还没有足够的领域数据。完成提炼并复习几张卡片后，这里会开始生成判断。" />
      )}
    </section>
  );
}

function WeakPointPanel({ weakPoints }: { weakPoints: WeakPoint[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-base font-semibold text-gray-900">薄弱点</h3>
      {weakPoints.length ? (
        <div className="space-y-3">
          {weakPoints.slice(0, 8).map(point => (
            <WeakPointItem key={point.id} point={point} />
          ))}
        </div>
      ) : (
        <EmptyState text="暂时没有明显薄弱点。" />
      )}
    </section>
  );
}

function StyleGauge({ label, value, left, right }: { label: string; value: number; left: string; right: string }) {
  const percent = Math.round(((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100);
  return (
    <div className="rounded-md bg-gray-50 p-3">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-gray-200">
        <div className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded bg-gray-900" style={{ left: `${percent}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-gray-400">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

function DomainRow({ domain }: { domain: DomainMastery }) {
  const mastery = Math.round(Math.max(0, Math.min(100, domain.masteryLevel)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium text-gray-800">{domain.domain}</span>
        <span className="shrink-0 text-gray-500">{mastery} 分</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${mastery}%` }} />
      </div>
      <div className="mt-1 text-xs text-gray-500">
        {domain.cardsMastered}/{domain.cardsTotal} 张稳定，平均保持率 {Math.round(domain.avgRetrievability * 100)}%
      </div>
    </div>
  );
}

function WeakPointItem({ point }: { point: WeakPoint }) {
  const label = point.conceptBLabel ? `${point.conceptALabel} / ${point.conceptBLabel}` : point.conceptALabel;
  return (
    <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2">
      <div className="truncate text-sm font-medium text-amber-950">{label}</div>
      <div className="mt-1 text-xs text-amber-800">遗忘信号 {point.confusionCount} 次，最近 {formatDate(point.lastConfused)}</div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-medium leading-6 text-gray-900">{value}</div>
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
