CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" uuid,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"tags" text[],
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "extraction_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"status" text DEFAULT 'pending',
	"current_step" text,
	"logs" jsonb DEFAULT '[]',
	"output" jsonb,
	"user_feedback" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_retrieval_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"vector_top_k" integer DEFAULT 10,
	"full_text_top_k" integer DEFAULT 10,
	"local_search_top_k" integer DEFAULT 10,
	"global_search_top_k" integer DEFAULT 5,
	"rrf_k" integer DEFAULT 60,
	"rrf_top_n" integer DEFAULT 10,
	"rerank_enabled" boolean DEFAULT true,
	"rerank_provider_config_id" uuid,
	"rerank_model" text,
	"rerank_top_n" integer DEFAULT 5,
	"context_budget_tokens" integer DEFAULT 1500,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "index_status" text DEFAULT 'idle';--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "index_logs" jsonb DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "index_error" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "indexed_at" timestamp;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "graph_sync_status" text DEFAULT 'idle';--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "graph_sync_logs" jsonb DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "graph_sync_error" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "graph_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_retrieval_settings" ADD CONSTRAINT "user_retrieval_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_retrieval_settings" ADD CONSTRAINT "user_retrieval_settings_rerank_provider_config_id_ai_provider_configs_id_fk" FOREIGN KEY ("rerank_provider_config_id") REFERENCES "public"."ai_provider_configs"("id") ON DELETE no action ON UPDATE no action;