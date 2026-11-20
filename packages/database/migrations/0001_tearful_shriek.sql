CREATE TABLE "studypal"."frontier_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb,
	"result" jsonb,
	"model" text NOT NULL,
	"charged_micros" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontier_valid_status" CHECK ("studypal"."frontier_jobs"."status" IN ('queued','running','completed','failed','canceled')),
	CONSTRAINT "frontier_nonnegative_charge" CHECK ("studypal"."frontier_jobs"."charged_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "studypal"."workspaces" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_revision_positive" CHECK ("studypal"."workspaces"."revision" > 0),
	CONSTRAINT "workspace_content_size" CHECK (octet_length("studypal"."workspaces"."content") <= 8388608)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "frontier_owner_request" ON "studypal"."frontier_jobs" USING btree ("owner_id","request_id");--> statement-breakpoint
CREATE INDEX "frontier_status_created" ON "studypal"."frontier_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "frontier_created" ON "studypal"."frontier_jobs" USING btree ("created_at");