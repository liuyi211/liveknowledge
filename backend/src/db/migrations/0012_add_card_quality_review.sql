ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS quality_reviewed_at timestamp;

CREATE INDEX IF NOT EXISTS idx_cards_quality_review
  ON cards (user_id, lapse_count, quality_reviewed_at);
