ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "source_metadata" jsonb;
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
