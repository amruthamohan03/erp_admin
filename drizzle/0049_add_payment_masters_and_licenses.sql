-- Payment masters + licenses_t (Import/Export License stage, §2).
-- Hand-written to match the source MySQL dump (drizzle-kit generate is not used
-- in this repo — see project notes). Postgres conversions: int(11)->integer,
-- decimal->numeric, enum->varchar + CHECK, ON UPDATE timestamp dropped (handled
-- by the app), backslash-escaped apostrophes -> doubled single quotes.

-- ===== payment_type_master_t (IMPORT / EXPORT) =====
CREATE TABLE IF NOT EXISTS "payment_type_master_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "payment_type_name" varchar(250) NOT NULL,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id"),
  "updated_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

INSERT INTO "payment_type_master_t" ("id", "payment_type_name", "created_by", "updated_by") VALUES
  (1, 'IMPORT', 1, 1),
  (2, 'EXPORT', 1, 1)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('payment_type_master_t', 'id'), (SELECT MAX(id) FROM "payment_type_master_t"));
--> statement-breakpoint

-- ===== payment_subtype_master_t (customs regime codes, child of payment_type) =====
CREATE TABLE IF NOT EXISTS "payment_subtype_master_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "payment_type_id" integer NOT NULL REFERENCES "payment_type_master_t"("id"),
  "payment_subtype" varchar(100) NOT NULL,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id"),
  "updated_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_subtype_master_t_type" ON "payment_subtype_master_t" ("payment_type_id");
--> statement-breakpoint

INSERT INTO "payment_subtype_master_t" ("id", "payment_type_id", "payment_subtype", "created_by", "updated_by") VALUES
  (1, 1, '01 - EXPORTATION AVEC RAPATRIEMENT', 1, 1),
  (2, 1, '02 - EXPORTATION TEMPORAIRE POUR LOCATION', 1, 1),
  (3, 1, '03 - EXPORTATION TEMPORAIRE POUR RÉPARATION', 1, 1),
  (4, 1, '04 - EXPORTATION TEMPORAIRE POUR TRAVAIL À FAÇON', 1, 1),
  (5, 1, '05 - EXPORTATION RETOUR EMBALLAGE', 1, 1),
  (6, 1, '06 - EXPORTATION EN CONSIGNATION', 1, 1),
  (7, 1, '07 - EXPORTATION SANS RAPATRIEMENT', 1, 1),
  (8, 1, '08 - EXPORTATION POUR REMBOURSEMENT/PREFINANCEMENT (EXPORTATION AVEC RAPATRIEMENT ANTICIPÉ)', 1, 1),
  (9, 1, '09 - EXPORTATION PAR AVITAILLEMENT', 1, 1),
  (10, 1, '10 - AUTRES (À SPÉCIFIER)', 1, 1),
  (11, 2, '20 - IMPORTATION AVEC PAIEMENT AVANT EMBARQUEMENT (IMPORTATION AVEC PAIEMENT ANTICIPÉ)', 1, 1),
  (12, 2, '21 - IMPORTATION AVEC PAIEMENT À L''EMBARQUEMENT (IMPORTATION AVEC PAIEMENT ANTICIPÉ)', 1, 1),
  (13, 2, '22 - IMPORTATION AVEC PAIEMENT À L''ARRIVÉE (IMPORTATION AVEC PAIEMENT ANTICIPÉ)', 1, 1),
  (14, 2, '23 - IMPORTATION SAD', 1, 1),
  (15, 2, '24 - IMPORTATION TEMPORAIRE', 1, 1),
  (16, 2, '25 - IMPORTATION AVEC PAIEMENT ORDINAIRE', 1, 1),
  (17, 2, '26 - IMPORTATION PAR AVITAILLEMENT', 1, 1),
  (18, 2, '27 - IMPORTATION SOUS DOUANE', 1, 1),
  (19, 2, '28 - IMPORTATION DONS/AIDES GOUVERNEMENT', 1, 1),
  (20, 2, '29 - IMPORTATION DONS/AIDES PRIVÉS', 1, 1),
  (21, 2, '30 - IMPORTATION APPORTS DES CAPITAUX', 1, 1),
  (22, 2, '31 - IMPORTATION AVEC GROUPAGE DES BIENS', 1, 1),
  (23, 2, '32 - IMPORTATION AVEC PAIEMENT AVANT LA FABRICATION DES BIENS (IMPORTATION AVEC PAIEMENT PAR AVANCE)', 1, 1),
  (24, 2, '33 - IMPORTATION TEMPORAIRE POUR LOCATION', 1, 1),
  (25, 2, '34 - IMPORTATION TEMPORAIRE RÉPARATION', 1, 1),
  (26, 2, '35 - IMPORTATION TEMPORAIRE POUR TRAVAIL À FAÇON', 1, 1),
  (27, 2, '36 - AUTRES (À SPÉCIFIER)', 1, 1)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('payment_subtype_master_t', 'id'), (SELECT MAX(id) FROM "payment_subtype_master_t"));
--> statement-breakpoint

-- ===== licenses_t =====
-- Business columns are nullable (see schema header): the §4.12 runtime INSERTs a
-- new row from a single accordion, so cross-accordion NOT NULLs can't be met on
-- create. Presence is enforced per field via master_page_accordion_field_t.
CREATE TABLE IF NOT EXISTS "licenses_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "license_number" varchar(50),
  "bank_id" integer REFERENCES "banklist_master_t"("id"),
  "client_id" integer REFERENCES "clients_t"("id"),
  "license_cleared_by" integer REFERENCES "done_by_t"("id"),
  "entry_post_id" integer REFERENCES "transit_point_master_t"("id"),
  "ref_cod" varchar(50),
  "type_of_goods_id" integer REFERENCES "type_of_goods_master_t"("id"),
  "weight" numeric(10,2),
  "m3" numeric(10,2),
  "unit_of_measurement_id" integer REFERENCES "unit_master_t"("id"),
  "fob_declared" numeric(15,2),
  "insurance" numeric(15,2),
  "freight" numeric(15,2),
  "other_costs" numeric(15,2),
  "transport_mode_id" integer REFERENCES "transport_mode_master_t"("id"),
  "invoice_number" varchar(50),
  "invoice_file" varchar(255),
  "invoice_date" date,
  "currency_id" integer REFERENCES "currency_master_t"("id"),
  "supplier" varchar(255),
  "license_applied_date" date,
  "license_validation_date" date,
  "license_expiry_date" date,
  "license_file" varchar(255),
  "kind_id" integer REFERENCES "kind_master_t"("id"),
  "payment_method_id" integer REFERENCES "payment_type_master_t"("id"),
  "payment_subtype_id" integer REFERENCES "payment_subtype_master_t"("id"),
  "destination_id" integer REFERENCES "origin_master_t"("id"),
  "fsi" varchar(100),
  "aur" varchar(100),
  "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
  "fob_currency_id" integer DEFAULT 1 REFERENCES "currency_master_t"("id"),
  "insurance_currency_id" integer DEFAULT 1 REFERENCES "currency_master_t"("id"),
  "freight_currency_id" integer DEFAULT 1 REFERENCES "currency_master_t"("id"),
  "other_costs_currency_id" integer DEFAULT 1 REFERENCES "currency_master_t"("id"),
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_by" integer REFERENCES "users_t"("id"),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "chk_licenses_t_status" CHECK ("status" IN ('ACTIVE','INACTIVE','ANNULATED','MODIFIED','PROROGATED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_licenses_t_license_number" ON "licenses_t" ("license_number") WHERE "license_number" IS NOT NULL AND "license_number" <> '';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_licenses_t_invoice_number" ON "licenses_t" ("invoice_number") WHERE "invoice_number" IS NOT NULL AND "invoice_number" <> '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_licenses_t_client" ON "licenses_t" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_licenses_t_kind" ON "licenses_t" ("kind_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_licenses_t_transport" ON "licenses_t" ("transport_mode_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_licenses_t_display_license" ON "licenses_t" ("display","license_number");
