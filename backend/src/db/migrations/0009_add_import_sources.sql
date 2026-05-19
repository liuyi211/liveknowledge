CREATE TABLE IF NOT EXISTS "import_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "source_type" text NOT NULL,
  "title" varchar(200) NOT NULL,
  "content" text NOT NULL,
  "content_hash" varchar(64) NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_import_sources_user_type_hash" ON "import_sources" USING btree ("user_id","source_type","content_hash");
