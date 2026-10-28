ALTER TABLE "ai_providers" ADD COLUMN "vision_test_status" text DEFAULT 'untested' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD COLUMN "vision_test_error" text;