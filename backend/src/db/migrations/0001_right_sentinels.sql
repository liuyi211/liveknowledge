ALTER TABLE "ai_provider_configs" ADD COLUMN "model" varchar(100);--> statement-breakpoint
ALTER TABLE "ai_provider_configs" ADD COLUMN "purpose" varchar(20) DEFAULT 'chat' NOT NULL;