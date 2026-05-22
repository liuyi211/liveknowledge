CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  style_visual real NOT NULL DEFAULT 0,
  style_intuitive real NOT NULL DEFAULT 0,
  style_gradual real NOT NULL DEFAULT 0,
  style_concise real NOT NULL DEFAULT 0,
  attention_span integer NOT NULL DEFAULT 25,
  optimal_session_length integer NOT NULL DEFAULT 30,
  preferred_difficulty real NOT NULL DEFAULT 6,
  memory_stability_factor real NOT NULL DEFAULT 1,
  memory_retrievability_threshold real NOT NULL DEFAULT 0.8,
  confidence real NOT NULL DEFAULT 0,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS domain_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain varchar(120) NOT NULL,
  mastery_level real NOT NULL DEFAULT 0,
  cards_total integer NOT NULL DEFAULT 0,
  cards_mastered integer NOT NULL DEFAULT 0,
  avg_retrievability real NOT NULL DEFAULT 0,
  last_studied timestamp,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_mastery_user_domain
  ON domain_mastery (user_id, domain);

CREATE INDEX IF NOT EXISTS idx_domain_mastery_user_mastery
  ON domain_mastery (user_id, mastery_level);

CREATE TABLE IF NOT EXISTS weak_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_a_id uuid REFERENCES concepts(id) ON DELETE CASCADE,
  concept_b_id uuid REFERENCES concepts(id) ON DELETE CASCADE,
  concept_a_label varchar(200) NOT NULL,
  concept_b_label varchar(200),
  confusion_count integer NOT NULL DEFAULT 1,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_confused timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weak_points_user_concept_a
  ON weak_points (user_id, concept_a_id);

CREATE INDEX IF NOT EXISTS idx_weak_points_user_last_confused
  ON weak_points (user_id, last_confused);
