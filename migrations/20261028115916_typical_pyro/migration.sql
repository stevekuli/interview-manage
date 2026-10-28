CREATE TABLE "invitation" (
	"id" text PRIMARY KEY,
	"code" text NOT NULL UNIQUE,
	"note" text,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "resume_user_id_index";--> statement-breakpoint
CREATE INDEX "invitation_created_at_index" ON "invitation" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "invitation_used_at_index" ON "invitation" ("used_at");