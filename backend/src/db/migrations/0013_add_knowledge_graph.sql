CREATE TABLE IF NOT EXISTS concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label varchar(200) NOT NULL,
  normalized_label varchar(200) NOT NULL,
  description text,
  domain varchar(120),
  aliases text[],
  source_type varchar(50),
  source_id uuid,
  confidence real NOT NULL DEFAULT 0.8,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_concepts_user_normalized
  ON concepts (user_id, normalized_label);

CREATE INDEX IF NOT EXISTS idx_concepts_user_label
  ON concepts (user_id, label);

CREATE TABLE IF NOT EXISTS concept_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  target_concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  relation_type varchar(50) NOT NULL,
  weight real NOT NULL DEFAULT 1,
  evidence text,
  source_type varchar(50),
  source_id uuid,
  confidence real NOT NULL DEFAULT 0.8,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concept_relations_user_source
  ON concept_relations (user_id, source_concept_id);

CREATE INDEX IF NOT EXISTS idx_concept_relations_user_target
  ON concept_relations (user_id, target_concept_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_concept_relations_unique
  ON concept_relations (user_id, source_concept_id, target_concept_id, relation_type);

CREATE TABLE IF NOT EXISTS note_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  role varchar(50) NOT NULL DEFAULT 'mentions',
  confidence real NOT NULL DEFAULT 0.8,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_note_concepts_note
  ON note_concepts (note_id);

CREATE INDEX IF NOT EXISTS idx_note_concepts_concept
  ON note_concepts (concept_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_note_concepts_unique
  ON note_concepts (user_id, note_id, concept_id);

CREATE TABLE IF NOT EXISTS card_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  role varchar(50) NOT NULL DEFAULT 'tests',
  confidence real NOT NULL DEFAULT 0.8,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_concepts_card
  ON card_concepts (card_id);

CREATE INDEX IF NOT EXISTS idx_card_concepts_concept
  ON card_concepts (concept_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_concepts_unique
  ON card_concepts (user_id, card_id, concept_id);
