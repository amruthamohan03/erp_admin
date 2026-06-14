-- Seal master (purchase batch) + individual seal numbers. Mirrors the source
-- seal_nos_t / seal_individual_numbers_t with real FK constraints (source kept them
-- as plain indexes). seal_number is globally unique.

CREATE TABLE IF NOT EXISTS "seal_nos_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "office_location_id" integer REFERENCES "main_office_master_t"("id"),
  "purchase_date" date,
  "total_amount" numeric(10,2) NOT NULL DEFAULT 0,
  "total_seal" integer NOT NULL DEFAULT 0,
  "sub_office_code" text,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id"),
  "updated_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seal_nos_t_office" ON "seal_nos_t" ("office_location_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seal_nos_t_purchase_date" ON "seal_nos_t" ("purchase_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seal_nos_t_display" ON "seal_nos_t" ("display");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "seal_individual_numbers_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "seal_master_id" integer NOT NULL REFERENCES "seal_nos_t"("id"),
  "seal_number" varchar(100) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'Available',
  "notes" text,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id"),
  "updated_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_seal_individual_numbers_t_number" ON "seal_individual_numbers_t" ("seal_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seal_individual_numbers_t_master" ON "seal_individual_numbers_t" ("seal_master_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seal_individual_numbers_t_status" ON "seal_individual_numbers_t" ("status");
