import type { ReviewScheduleInput, ReviewScheduleResult } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function calculateRetrievability(lastReviewedAt: Date | null, halfLife: number, now = new Date()): number {
  if (!lastReviewedAt) return 1;
  const elapsedDays = Math.max(0, (now.getTime() - lastReviewedAt.getTime()) / DAY_MS);
  return clamp(Math.pow(2, -elapsedDays / Math.max(halfLife, 0.02)), 0, 1);
}

export function scheduleReview(input: ReviewScheduleInput): ReviewScheduleResult {
  const reviewedAt = input.reviewedAt ?? new Date();
  const currentHalfLife = clamp(input.halfLife || 1, 0.02, 3650);
  const currentDifficulty = clamp(input.difficulty || 6, 1, 18);
  const retrievability = calculateRetrievability(input.lastReviewedAt, currentHalfLife, reviewedAt);

  let difficulty = currentDifficulty;
  let halfLife = currentHalfLife;
  let intervalDays = currentHalfLife;
  let lapseCount = input.lapseCount;

  switch (input.rating) {
    case 1:
      difficulty += 1.2;
      halfLife *= 0.45;
      intervalDays = input.reviewCount === 0 ? 0.02 : 1;
      lapseCount += 1;
      break;
    case 2:
      difficulty += 0.4;
      halfLife *= 1.2;
      intervalDays = halfLife * 0.8;
      break;
    case 3:
      difficulty -= 0.1;
      halfLife *= 2;
      intervalDays = halfLife;
      break;
    case 4:
      difficulty -= 0.5;
      halfLife *= 3;
      intervalDays = halfLife * 1.3;
      break;
  }

  difficulty = clamp(difficulty, 1, 18);
  halfLife = clamp(halfLife, 0.02, 3650);
  intervalDays = clamp(intervalDays, 0.02, 3650);

  return {
    difficulty,
    halfLife,
    retrievability,
    nextReviewAt: addDays(reviewedAt, intervalDays),
    intervalDays,
    lapseCount,
  };
}

export function formatInterval(days: number): string {
  if (days < 1 / 24) {
    return `${Math.max(1, Math.round(days * 24 * 60))} 分钟`;
  }
  if (days < 1) {
    return `${Math.max(1, Math.round(days * 24))} 小时`;
  }
  if (days < 30) {
    return `${Math.round(days)} 天`;
  }
  if (days < 365) {
    return `${Math.round(days / 30)} 个月`;
  }
  return `${Math.round(days / 365)} 年`;
}

export function predictRatingIntervals(state: Omit<ReviewScheduleInput, 'rating'>): Record<1 | 2 | 3 | 4, {
  intervalDays: number;
  label: string;
  nextReviewAt: Date;
}> {
  return ([1, 2, 3, 4] as const).reduce((acc, rating) => {
    const schedule = scheduleReview({ ...state, rating });
    acc[rating] = {
      intervalDays: schedule.intervalDays,
      label: formatInterval(schedule.intervalDays),
      nextReviewAt: schedule.nextReviewAt,
    };
    return acc;
  }, {} as Record<1 | 2 | 3 | 4, { intervalDays: number; label: string; nextReviewAt: Date }>);
}
