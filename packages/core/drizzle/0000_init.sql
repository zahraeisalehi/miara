CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tool" text NOT NULL,
	"app" text,
	"args" jsonb,
	"args_hash" text NOT NULL,
	"tier" smallint NOT NULL,
	"escalation" jsonb,
	"cost_preview" jsonb,
	"confirmation_text" text,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"rule" text NOT NULL,
	"severity" text NOT NULL,
	"title_fa" text NOT NULL,
	"summary" text,
	"evidence" jsonb,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution_reason" text
);
--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"app" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cpu" double precision,
	"memory_bytes" double precision,
	"probe_status" integer,
	"probe_latency_ms" integer,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"tool" text,
	"app" text,
	"tier" smallint,
	"mode" text,
	"actor" text NOT NULL,
	"message_fa" text NOT NULL,
	"message_en" text NOT NULL,
	"error_raw" jsonb,
	"error_explanation_fa" text,
	"llm" jsonb,
	"llm_cost_usd" double precision,
	"data" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "approvals_pending_idx" ON "approvals" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "incidents_app_status_idx" ON "incidents" USING btree ("app","status");--> statement-breakpoint
CREATE INDEX "metric_snapshots_app_taken_idx" ON "metric_snapshots" USING btree ("app","taken_at");--> statement-breakpoint
CREATE INDEX "timeline_app_created_idx" ON "timeline_events" USING btree ("app","created_at");--> statement-breakpoint
CREATE INDEX "timeline_operation_idx" ON "timeline_events" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "timeline_breaker_idx" ON "timeline_events" USING btree ("tool","app","mode","status","created_at");