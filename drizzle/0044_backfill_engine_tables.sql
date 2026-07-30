-- 0044 — backfill the §4 engine tables on databases that were baselined
-- rather than migrated.
--
-- A database provisioned by restoring main's dump (scripts/setup-db.ts) has
-- drizzle.__drizzle_migrations pre-populated, so `db:migrate` skips 0002-0020
-- and the rule / workflow / form / case-template / status / validation tables
-- are never created — `db:seed` then dies on the first seed that touches one
-- (relation "field_validation_master_t" does not exist). Those migrations
-- cannot simply be replayed: 0006 also creates client_master_t, which the
-- dump already has.
--
-- This migration re-issues just the missing objects, guarded, so it is a no-op
-- on a database built by the full migration chain and repairs a baselined one.
CREATE OR REPLACE FUNCTION pg_temp.add_fk_if_absent(p_table text, p_col text, p_stmt text) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class     t ON t.oid = c.conrelid AND t.relname = p_table
      JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = p_col
     WHERE c.contype = 'f' AND a.attnum = ANY (c.conkey)
  ) THEN
    EXECUTE p_stmt;
  END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $$ BEGIN
  IF to_regclass('public.application_settings_master_t') IS NULL
     AND to_regclass('public.application_settings_t') IS NOT NULL THEN
    -- main named the branding singleton application_settings_t; keep the row.
    ALTER TABLE application_settings_t RENAME TO application_settings_master_t;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rule_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"scope" varchar(50),
	"rule_json" jsonb NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rule_master_t_rule_key_unique" UNIQUE("rule_key")
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('rule_master_t', 'created_by', 'ALTER TABLE "rule_master_t" ADD CONSTRAINT "rule_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('rule_master_t', 'updated_by', 'ALTER TABLE "rule_master_t" ADD CONSTRAINT "rule_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"entity_type" varchar(100) NOT NULL,
	"initial_state" varchar(100) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_master_t_workflow_key_unique" UNIQUE("workflow_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_transition_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_id" integer NOT NULL,
	"transition_key" varchar(100) NOT NULL,
	"from_state" varchar(100) NOT NULL,
	"to_state" varchar(100) NOT NULL,
	"rule_id" integer,
	"action_json" jsonb,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('workflow_master_t', 'created_by', 'ALTER TABLE "workflow_master_t" ADD CONSTRAINT "workflow_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('workflow_master_t', 'updated_by', 'ALTER TABLE "workflow_master_t" ADD CONSTRAINT "workflow_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('workflow_transition_master_t', 'workflow_id', 'ALTER TABLE "workflow_transition_master_t" ADD CONSTRAINT "workflow_transition_master_t_workflow_id_workflow_master_t_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_master_t"("id") ON DELETE cascade ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('workflow_transition_master_t', 'rule_id', 'ALTER TABLE "workflow_transition_master_t" ADD CONSTRAINT "workflow_transition_master_t_rule_id_rule_master_t_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rule_master_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('workflow_transition_master_t', 'created_by', 'ALTER TABLE "workflow_transition_master_t" ADD CONSTRAINT "workflow_transition_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('workflow_transition_master_t', 'updated_by', 'ALTER TABLE "workflow_transition_master_t" ADD CONSTRAINT "workflow_transition_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "form_definition_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"entity_type" varchar(100) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "form_definition_master_t_form_key_unique" UNIQUE("form_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "form_field_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"field_key" varchar(100) NOT NULL,
	"label" varchar(255) NOT NULL,
	"field_type" varchar(50) NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"help_text" text,
	"validation_json" jsonb,
	"options_json" jsonb,
	"display_order" integer DEFAULT 0 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('form_definition_master_t', 'created_by', 'ALTER TABLE "form_definition_master_t" ADD CONSTRAINT "form_definition_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('form_definition_master_t', 'updated_by', 'ALTER TABLE "form_definition_master_t" ADD CONSTRAINT "form_definition_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('form_field_master_t', 'form_id', 'ALTER TABLE "form_field_master_t" ADD CONSTRAINT "form_field_master_t_form_id_form_definition_master_t_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form_definition_master_t"("id") ON DELETE cascade ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('form_field_master_t', 'created_by', 'ALTER TABLE "form_field_master_t" ADD CONSTRAINT "form_field_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('form_field_master_t', 'updated_by', 'ALTER TABLE "form_field_master_t" ADD CONSTRAINT "form_field_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_template_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"entity_type" varchar(100) NOT NULL,
	"form_id" integer NOT NULL,
	"workflow_id" integer NOT NULL,
	"target_table" varchar(100) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "case_template_master_t_template_key_unique" UNIQUE("template_key")
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('case_template_master_t', 'form_id', 'ALTER TABLE "case_template_master_t" ADD CONSTRAINT "case_template_master_t_form_id_form_definition_master_t_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form_definition_master_t"("id") ON DELETE restrict ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('case_template_master_t', 'workflow_id', 'ALTER TABLE "case_template_master_t" ADD CONSTRAINT "case_template_master_t_workflow_id_workflow_master_t_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_master_t"("id") ON DELETE restrict ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('case_template_master_t', 'created_by', 'ALTER TABLE "case_template_master_t" ADD CONSTRAINT "case_template_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('case_template_master_t', 'updated_by', 'ALTER TABLE "case_template_master_t" ADD CONSTRAINT "case_template_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "status_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"status_key" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"entity_type" varchar(100),
	"color" varchar(30),
	"badge" varchar(50),
	"is_final" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_type_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"type_key" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"category" varchar(50),
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_type_master_t_type_key_unique" UNIQUE("type_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "license_type_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"type_code" varchar(30) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "license_type_master_t_type_code_unique" UNIQUE("type_code")
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('status_master_t', 'created_by', 'ALTER TABLE "status_master_t" ADD CONSTRAINT "status_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('status_master_t', 'updated_by', 'ALTER TABLE "status_master_t" ADD CONSTRAINT "status_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('document_type_master_t', 'created_by', 'ALTER TABLE "document_type_master_t" ADD CONSTRAINT "document_type_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('document_type_master_t', 'updated_by', 'ALTER TABLE "document_type_master_t" ADD CONSTRAINT "document_type_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_type_master_t', 'created_by', 'ALTER TABLE "license_type_master_t" ADD CONSTRAINT "license_type_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_type_master_t', 'updated_by', 'ALTER TABLE "license_type_master_t" ADD CONSTRAINT "license_type_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "status_master_key_entity_uq" ON "status_master_t" USING btree ("status_key","entity_type");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax_rule_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"jurisdiction" varchar(50),
	"scope" varchar(50),
	"formula" jsonb NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"display_order" integer DEFAULT 0 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tax_rule_master_t_rule_key_unique" UNIQUE("rule_key")
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('tax_rule_master_t', 'created_by', 'ALTER TABLE "tax_rule_master_t" ADD CONSTRAINT "tax_rule_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('tax_rule_master_t', 'updated_by', 'ALTER TABLE "tax_rule_master_t" ADD CONSTRAINT "tax_rule_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_toggle_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"toggle_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feature_toggle_master_t_toggle_key_unique" UNIQUE("toggle_key")
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('feature_toggle_master_t', 'created_by', 'ALTER TABLE "feature_toggle_master_t" ADD CONSTRAINT "feature_toggle_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('feature_toggle_master_t', 'updated_by', 'ALTER TABLE "feature_toggle_master_t" ADD CONSTRAINT "feature_toggle_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "field_validation_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"validation_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"pattern" text NOT NULL,
	"error_message" varchar(255),
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "field_validation_master_t_validation_key_unique" UNIQUE("validation_key")
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('field_validation_master_t', 'created_by', 'ALTER TABLE "field_validation_master_t" ADD CONSTRAINT "field_validation_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('field_validation_master_t', 'updated_by', 'ALTER TABLE "field_validation_master_t" ADD CONSTRAINT "field_validation_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_outbox_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" varchar(30) NOT NULL,
	"recipient" text NOT NULL,
	"template" varchar(100) NOT NULL,
	"payload" jsonb,
	"template_key" varchar(100),
	"case_id" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_hierarchy_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"hierarchy_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"entity_type" varchar(100) NOT NULL,
	"stages_json" jsonb NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "approval_hierarchy_master_t_hierarchy_key_unique" UNIQUE("hierarchy_key")
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('approval_hierarchy_master_t', 'created_by', 'ALTER TABLE "approval_hierarchy_master_t" ADD CONSTRAINT "approval_hierarchy_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('approval_hierarchy_master_t', 'updated_by', 'ALTER TABLE "approval_hierarchy_master_t" ADD CONSTRAINT "approval_hierarchy_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracking_template_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"license_type_id" integer NOT NULL,
	"milestones_json" jsonb NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_template_master_t_template_key_unique" UNIQUE("template_key")
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('tracking_template_master_t', 'license_type_id', 'ALTER TABLE "tracking_template_master_t" ADD CONSTRAINT "tracking_template_master_t_license_type_id_license_type_master_t_id_fk" FOREIGN KEY ("license_type_id") REFERENCES "public"."license_type_master_t"("id") ON DELETE restrict ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('tracking_template_master_t', 'created_by', 'ALTER TABLE "tracking_template_master_t" ADD CONSTRAINT "tracking_template_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('tracking_template_master_t', 'updated_by', 'ALTER TABLE "tracking_template_master_t" ADD CONSTRAINT "tracking_template_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" varchar(100) NOT NULL,
	"client_id" integer NOT NULL,
	"license_id" integer,
	"state" varchar(50) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"tax" numeric(18, 2),
	"total_amount" numeric(18, 2),
	"currency" varchar(3) NOT NULL,
	"issue_date" date,
	"due_date" date,
	"paid_at" timestamp,
	"notes" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_t_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('invoice_t', 'client_id', 'ALTER TABLE "invoice_t" ADD CONSTRAINT "invoice_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE restrict ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('invoice_t', 'license_id', 'ALTER TABLE "invoice_t" ADD CONSTRAINT "invoice_t_license_id_license_t_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."license_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('invoice_t', 'created_by', 'ALTER TABLE "invoice_t" ADD CONSTRAINT "invoice_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('invoice_t', 'updated_by', 'ALTER TABLE "invoice_t" ADD CONSTRAINT "invoice_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_note_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"credit_note_number" varchar(100) NOT NULL,
	"invoice_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"state" varchar(50) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"reason" text NOT NULL,
	"issued_date" date,
	"applied_at" timestamp,
	"notes" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_note_t_credit_note_number_unique" UNIQUE("credit_note_number")
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('credit_note_t', 'invoice_id', 'ALTER TABLE "credit_note_t" ADD CONSTRAINT "credit_note_t_invoice_id_invoice_t_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice_t"("id") ON DELETE restrict ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('credit_note_t', 'client_id', 'ALTER TABLE "credit_note_t" ADD CONSTRAINT "credit_note_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE restrict ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('credit_note_t', 'created_by', 'ALTER TABLE "credit_note_t" ADD CONSTRAINT "credit_note_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('credit_note_t', 'updated_by', 'ALTER TABLE "credit_note_t" ADD CONSTRAINT "credit_note_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracking_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracking_number" varchar(100) NOT NULL,
	"license_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"state" varchar(50) NOT NULL,
	"current_milestone_key" varchar(50),
	"milestones_completed_json" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"notes" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_t_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('tracking_t', 'license_id', 'ALTER TABLE "tracking_t" ADD CONSTRAINT "tracking_t_license_id_license_t_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."license_t"("id") ON DELETE restrict ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('tracking_t', 'template_id', 'ALTER TABLE "tracking_t" ADD CONSTRAINT "tracking_t_template_id_tracking_template_master_t_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."tracking_template_master_t"("id") ON DELETE restrict ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('tracking_t', 'created_by', 'ALTER TABLE "tracking_t" ADD CONSTRAINT "tracking_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('tracking_t', 'updated_by', 'ALTER TABLE "tracking_t" ADD CONSTRAINT "tracking_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_definition_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(50),
	"form_id" integer,
	"columns_json" jsonb NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "report_definition_master_t_report_key_unique" UNIQUE("report_key")
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('report_definition_master_t', 'form_id', 'ALTER TABLE "report_definition_master_t" ADD CONSTRAINT "report_definition_master_t_form_id_form_definition_master_t_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form_definition_master_t"("id") ON DELETE restrict ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('report_definition_master_t', 'created_by', 'ALTER TABLE "report_definition_master_t" ADD CONSTRAINT "report_definition_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('report_definition_master_t', 'updated_by', 'ALTER TABLE "report_definition_master_t" ADD CONSTRAINT "report_definition_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "form_field_role_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"field_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"permission" varchar(10) NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "form_field_role_t_permission_check" CHECK ("form_field_role_t"."permission" IN ('view', 'edit', 'hidden'))
);
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('form_field_role_t', 'field_id', 'ALTER TABLE "form_field_role_t" ADD CONSTRAINT "form_field_role_t_field_id_form_field_master_t_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."form_field_master_t"("id") ON DELETE cascade ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('form_field_role_t', 'role_id', 'ALTER TABLE "form_field_role_t" ADD CONSTRAINT "form_field_role_t_role_id_role_master_t_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_master_t"("id") ON DELETE cascade ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('form_field_role_t', 'created_by', 'ALTER TABLE "form_field_role_t" ADD CONSTRAINT "form_field_role_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('form_field_role_t', 'updated_by', 'ALTER TABLE "form_field_role_t" ADD CONSTRAINT "form_field_role_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_form_field_role_t" ON "form_field_role_t" USING btree ("field_id","role_id");
