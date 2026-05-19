export type ReviewRating = 1 | 2 | 3 | 4;

export interface ReviewState {
  difficulty: number;
  halfLife: number;
  lastReviewedAt: Date | null;
  reviewCount: number;
  lapseCount: number;
}

export interface ReviewScheduleInput extends ReviewState {
  rating: ReviewRating;
  reviewedAt?: Date;
}

export interface ReviewScheduleResult {
  difficulty: number;
  halfLife: number;
  retrievability: number;
  nextReviewAt: Date;
  intervalDays: number;
  lapseCount: number;
}
