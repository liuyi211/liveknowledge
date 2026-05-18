ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "base64" text;
--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "file_size" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "file_path" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("content", ''))
) STORED;
--> statement-breakpoint
CREATE INDEX "idx_notes_search_vector" ON "notes" USING gin ("search_vector");
