ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS difficulty real NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS half_life real NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS retrievability real NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS next_review_at timestamp NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lapse_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_cards_due ON cards (user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_cards_note ON cards (note_id);

CREATE TABLE IF NOT EXISTS card_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  rating integer NOT NULL,
  response_time_ms integer NOT NULL DEFAULT 0,
  half_life_before real NOT NULL,
  half_life_after real NOT NULL,
  difficulty_before real NOT NULL,
  difficulty_after real NOT NULL,
  retrievability_before real NOT NULL,
  retrievability_after real NOT NULL,
  reviewed_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_reviews_card ON card_reviews (card_id, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_card_reviews_user ON card_reviews (user_id, reviewed_at);
