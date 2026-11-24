-- Import License → Import Apurement (licence clearance, IB), ported from the
-- legacy ImportapurmentController. See src/db/schema/importApurement.ts.
--
--   * apurement_option_master_t — the Type / Remarque dropdown choices (§4.1),
--     seeded with the legacy values
--   * import_transmission_t     — one row per transmission sent to a bank
--   * import_apurement_t        — one row per import file
--   * mca_ref_format_master_t   — target 'import-apurement' (0001-IB-MCA-26)
--   * menu                      — the Import License placeholder pointed at the
--     screen, plus Masters → Apurement Options; Super Admin granted both

-- 1. The option master.
CREATE TABLE IF NOT EXISTS "apurement_option_master_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "option_group" varchar(20) NOT NULL,
  "option_name" varchar(100) NOT NULL,
  "requires_remark" boolean DEFAULT false NOT NULL,
  "display" varchar(1) DEFAULT 'Y' NOT NULL,
  "created_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "apurement_option_master_t_group_check" CHECK ("option_group" IN ('type', 'remark'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_apurement_option_master_t_name"
  ON "apurement_option_master_t" ("option_group", upper("option_name"));
--> statement-breakpoint
-- The legacy screen's four values. "Partial" requires a Remarque and "Total"
-- clears it — carried by requires_remark, not by the names, so renaming either
-- keeps the rule. The legacy spelling "Provissional" is corrected here; an
-- administrator can rename any of them under Masters → Apurement Options.
INSERT INTO "apurement_option_master_t" ("option_group", "option_name", "requires_remark")
VALUES ('type', 'Partial', true),
       ('type', 'Total', false),
       ('remark', 'AV Provisional', false),
       ('remark', 'License Provisional', false)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 2. Transmissions.
CREATE TABLE IF NOT EXISTS "import_transmission_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "client_master_t"("id"),
  "license_id" integer NOT NULL REFERENCES "license_t"("id"),
  "bank_id" integer NOT NULL REFERENCES "banklist_master_t"("id"),
  "transmission_reference" varchar(100) NOT NULL,
  "transmission_date" date NOT NULL,
  "date_depot" date NOT NULL,
  "ar_file_id" integer REFERENCES "files_t"("id") ON DELETE SET NULL,
  "display" varchar(1) DEFAULT 'Y' NOT NULL,
  "created_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_import_transmission_t_client_ref"
  ON "import_transmission_t" ("client_id", "transmission_reference");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_transmission_t_license"
  ON "import_transmission_t" ("license_id");
--> statement-breakpoint

-- 3. Per-file apurement records.
CREATE TABLE IF NOT EXISTS "import_apurement_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "import_id" integer NOT NULL REFERENCES "imports_t"("id"),
  "ass_ref" varchar(100),
  "clearance_type_id" integer REFERENCES "apurement_option_master_t"("id"),
  "clearance_remark_id" integer REFERENCES "apurement_option_master_t"("id"),
  "transmission_id" integer REFERENCES "import_transmission_t"("id"),
  "created_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_import_apurement_t_import"
  ON "import_apurement_t" ("import_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_apurement_t_transmission"
  ON "import_apurement_t" ("transmission_id");
--> statement-breakpoint

-- 4. The transmission reference (§4.33). The CHECK lists every target, so it is
-- restated whole.
ALTER TABLE "mca_ref_format_master_t"
  DROP CONSTRAINT IF EXISTS "mca_ref_format_master_t_target_key_check";
--> statement-breakpoint
ALTER TABLE "mca_ref_format_master_t"
  ADD CONSTRAINT "mca_ref_format_master_t_target_key_check"
  CHECK ("target_key" IN (
    'import', 'export', 'license', 'local', 'export-invoice', 'import-invoice',
    'partielle', 'fiche', 'import-apurement'
  ));
--> statement-breakpoint
INSERT INTO "mca_ref_format_master_t" ("target_key", "format_name", "segments", "display")
SELECT 'import-apurement', 'Import Apurement — Transmission Reference',
       '[{"type":"sequence","width":4},{"type":"literal","separator":"-","value":"IB"},{"type":"literal","separator":"-","value":"MCA"},{"type":"year","separator":"-","digits":2}]'::jsonb,
       'Y'
WHERE NOT EXISTS (SELECT 1 FROM "mca_ref_format_master_t" WHERE "target_key" = 'import-apurement');
--> statement-breakpoint

-- 5. Menu. The Import License group has carried an "IMPORT APURMENT" entry at
-- '#' since the port; point it at the screen rather than add a second one.
--
-- Matched whatever its URL has since been edited to, not only '#': installs
-- exist where it was typed by hand as 'import-apurement', without the leading
-- slash. Permissions are looked up by exact URL, so that row granted nothing —
-- not even to Super Admin — and an exact '#' match would have left it in place
-- and added a duplicate beside it.
UPDATE "menu_master_t" m
   SET "url" = '/import-apurement',
       "menu_name" = 'Import Apurement',
       "display" = 'Y'
  FROM "menu_master_t" p
 WHERE m."menu_id" = p."id"
   AND p."menu_name" = 'Import License' AND p."menu_level" = 0
   AND upper(m."menu_name") IN ('IMPORT APURMENT', 'IMPORT APUREMENT')
   AND (m."url" = '#' OR m."url" NOT LIKE '/%')
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" x WHERE x."url" = '/import-apurement');
--> statement-breakpoint
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id",
       COALESCE((SELECT max(c."menu_order") FROM "menu_master_t" c WHERE c."menu_id" = p."id"), 0) + 1,
       1, 'Import Apurement', '/import-apurement', '', 'Y'
  FROM "menu_master_t" p
 WHERE p."menu_name" = 'Import License' AND p."menu_level" = 0
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/import-apurement');
--> statement-breakpoint
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id",
       COALESCE((SELECT max(c."menu_order") FROM "menu_master_t" c WHERE c."menu_id" = p."id"), 0) + 1,
       1, 'Apurement Options', '/masters/apurement-options', '', 'Y'
  FROM "menu_master_t" p
 WHERE p."menu_name" = 'Masters' AND p."menu_level" = 0
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/masters/apurement-options');
--> statement-breakpoint
-- Super Admin only; every other role is granted under Mapping → Role to Menu.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT 1, m."id", true, true, true, true, true, true, true, true, true, true, true, true, true
  FROM "menu_master_t" m
 WHERE m."url" IN ('/import-apurement', '/masters/apurement-options')
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x WHERE x."role_id" = 1 AND x."menu_id" = m."id");
