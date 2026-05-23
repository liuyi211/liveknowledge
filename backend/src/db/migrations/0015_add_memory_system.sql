ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "context_summary_updated_at" timestamp;
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "context_summary_up_to_message_id" uuid;
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "context_summary_version" integer DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "conversation_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "chat_sessions"("id") ON DELETE SET NULL,
  "type" text NOT NULL,
  "content" text NOT NULL,
  "normalized_content" text,
  "source_message_ids" uuid[],
  "importance" real NOT NULL DEFAULT 0.5,
  "confidence" real NOT NULL DEFAULT 0.7,
  "status" text NOT NULL DEFAULT 'active',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "last_used_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_conversation_memories_user_status"
  ON "conversation_memories" ("user_id", "status", "updated_at");

CREATE INDEX IF NOT EXISTS "idx_conversation_memories_user_type"
  ON "conversation_memories" ("user_id", "type");

CREATE INDEX IF NOT EXISTS "idx_conversation_memories_user_normalized"
  ON "conversation_memories" ("user_id", "normalized_content");
