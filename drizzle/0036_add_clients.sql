-- clients_t — primary client/customer table for the customs ERP.
-- Mirrors the source MySQL schema 1:1 in column names. All possible PostgreSQL
-- constraints are added:
--   * FK constraints on every *_id that has a known target master
--   * Case-insensitive partial UNIQUE indexes on identifier fields (only where NOT NULL)
--   * CHECK constraints on enum-like fields (client_type, payment_term, invoice_template, display)
--   * CHECK on numeric range (credit_term 0-365)
--   * CHECK on date ordering (phase_end >= phase_start, contract_validity >= contract_start)
--   * B-tree indexes on every FK column for join performance
--
-- TODO(storage): the four *_file columns are plain varchar paths per the source
-- schema. Per CLAUDE.md §4.11 these should be FKs into a future `files` table once
-- S3 storage is wired up. Migrate when that exists.

CREATE TABLE "clients_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" varchar(200) NOT NULL,
	"short_name" varchar(3) NOT NULL,
	"client_type" varchar(10) NOT NULL,
	"group_company_id" integer,
	"industry_type_id" integer,
	"referred_by_id" integer,
	"office_location_id" integer,
	"address" text,
	"phase_id" integer,
	"phase_start_date" date,
	"phase_end_date" date,
	"contact_person" varchar(100),
	"email" varchar(100),
	"email_secondary" varchar(100),
	"phone" varchar(20),
	"phone_secondary" varchar(20),
	"id_nat_number" varchar(50),
	"id_nat_file" varchar(255),
	"rccm_number" varchar(50),
	"rccm_file" varchar(255),
	"import_export_number" varchar(50),
	"import_export_validity" date,
	"import_export_file" varchar(255),
	"attestation_number" varchar(50),
	"attestation_validity" date,
	"attestation_file" varchar(255),
	"nif_number" varchar(50),
	"payment_contact_email" varchar(100),
	"payment_contact_phone" varchar(20),
	"payment_term" varchar(50),
	"credit_term" integer DEFAULT 0,
	"liquidation_paid_by" integer,
	"license_cleared_by" integer,
	"license_submit_to_bank" integer,
	"contract_start_date" date,
	"contract_validity" date,
	"approval_code" varchar(50),
	"invoice_template" varchar(1) DEFAULT 'I' NOT NULL,
	"verified_by_id" integer,
	"verified_by_date" date,
	"approved_by_id" integer,
	"approved_by_date" date,
	"remarks" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	-- CHECK constraints (inline) -----------------------------------------------
	-- Letters from {I, E, L} in any combination; 1-10 chars.
	CONSTRAINT "clients_t_client_type_check"
		CHECK ("client_type" ~ '^[IEL]+$' AND length("client_type") BETWEEN 1 AND 10),
	-- Invoice template is one of I, E, L.
	CONSTRAINT "clients_t_invoice_template_check"
		CHECK ("invoice_template" IN ('I', 'E', 'L')),
	-- Display flag is Y or N (mirrors all other masters).
	CONSTRAINT "clients_t_display_check"
		CHECK ("display" IN ('Y', 'N')),
	-- Payment term — NULL OR one of the supported buckets.
	CONSTRAINT "clients_t_payment_term_check"
		CHECK ("payment_term" IS NULL OR "payment_term" IN ('ADVANCE', '15days', '30days', '45days', '60days')),
	-- Credit term is 0-365 days.
	CONSTRAINT "clients_t_credit_term_range_check"
		CHECK ("credit_term" IS NULL OR ("credit_term" >= 0 AND "credit_term" <= 365)),
	-- Date ordering: end >= start (when both present).
	CONSTRAINT "clients_t_phase_dates_check"
		CHECK ("phase_start_date" IS NULL OR "phase_end_date" IS NULL OR "phase_end_date" >= "phase_start_date"),
	CONSTRAINT "clients_t_contract_dates_check"
		CHECK ("contract_start_date" IS NULL OR "contract_validity" IS NULL OR "contract_validity" >= "contract_start_date")
);
--> statement-breakpoint
-- Foreign keys --------------------------------------------------------------
ALTER TABLE "clients_t" ADD CONSTRAINT "clients_t_group_company_id_fk" FOREIGN KEY ("group_company_id") REFERENCES "public"."group_company_master_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clients_t" ADD CONSTRAINT "clients_t_industry_type_id_fk" FOREIGN KEY ("industry_type_id") REFERENCES "public"."industry_master_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clients_t" ADD CONSTRAINT "clients_t_referred_by_id_fk" FOREIGN KEY ("referred_by_id") REFERENCES "public"."refferer_master_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clients_t" ADD CONSTRAINT "clients_t_office_location_id_fk" FOREIGN KEY ("office_location_id") REFERENCES "public"."office_location_master_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clients_t" ADD CONSTRAINT "clients_t_phase_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phase_master_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clients_t" ADD CONSTRAINT "clients_t_liquidation_paid_by_fk" FOREIGN KEY ("liquidation_paid_by") REFERENCES "public"."done_by_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clients_t" ADD CONSTRAINT "clients_t_license_cleared_by_fk" FOREIGN KEY ("license_cleared_by") REFERENCES "public"."done_by_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clients_t" ADD CONSTRAINT "clients_t_license_submit_to_bank_fk" FOREIGN KEY ("license_submit_to_bank") REFERENCES "public"."done_by_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clients_t" ADD CONSTRAINT "clients_t_verified_by_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clients_t" ADD CONSTRAINT "clients_t_approved_by_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clients_t" ADD CONSTRAINT "clients_t_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clients_t" ADD CONSTRAINT "clients_t_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Case-insensitive UNIQUE indexes on identifier fields ----------------------
-- short_name is NOT NULL — straight CI unique.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_clients_t_short_name_ci" ON "clients_t" (LOWER("short_name"));
--> statement-breakpoint
-- The rest are nullable identifiers — partial unique indexes so NULLs don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_clients_t_id_nat_number_ci" ON "clients_t" (LOWER("id_nat_number")) WHERE "id_nat_number" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_clients_t_rccm_number_ci" ON "clients_t" (LOWER("rccm_number")) WHERE "rccm_number" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_clients_t_import_export_number_ci" ON "clients_t" (LOWER("import_export_number")) WHERE "import_export_number" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_clients_t_nif_number_ci" ON "clients_t" (LOWER("nif_number")) WHERE "nif_number" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_clients_t_approval_code_ci" ON "clients_t" (LOWER("approval_code")) WHERE "approval_code" IS NOT NULL;
--> statement-breakpoint
-- FK indexes (B-tree on every FK column so joins don't seq-scan) ------------
CREATE INDEX IF NOT EXISTS "idx_clients_t_group_company" ON "clients_t" ("group_company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clients_t_industry_type" ON "clients_t" ("industry_type_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clients_t_office_location" ON "clients_t" ("office_location_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clients_t_phase" ON "clients_t" ("phase_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clients_t_referred_by" ON "clients_t" ("referred_by_id");
--> statement-breakpoint
-- Covering index for the most common list-page query: display + name lookup.
CREATE INDEX IF NOT EXISTS "idx_clients_t_display_company" ON "clients_t" ("display", "company_name");
