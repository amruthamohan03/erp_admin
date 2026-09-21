-- Data Import (Data Import → /data-import).
--
-- Pick a module, upload a spreadsheet or a scanned document, review what was
-- read, and create the records. The importer has NO write path of its own: each
-- reviewed row is posted to that module's own save route as the operator, so
-- every validation, derive, uniqueness check, audit entry and notification
-- behaves exactly as if the form had been filled in by hand. Nothing in the
-- existing modules changed to support this.
--
--   import_target_master_t      — which modules the dropdown offers (§4.1)
--   import_field_alias_master_t — headings the importer has been taught
--   import_batch_t / _row_t     — one upload, and what became of each row
--
-- See src/db/queries/dataImport.ts and src/lib/dataImport/.

CREATE TABLE IF NOT EXISTS "import_target_master_t" (
  "id"            serial PRIMARY KEY,
  "target_key"    varchar(60) NOT NULL UNIQUE,
  "name"          varchar(150) NOT NULL,
  "handler"       varchar(20) NOT NULL CHECK ("handler" IN ('page', 'users')),
  "page_slug"     varchar(60),
  "menu_url"      varchar(200) NOT NULL,
  "hint"          text,
  "display_order" integer NOT NULL DEFAULT 0,
  "display"       varchar(1) NOT NULL DEFAULT 'Y',
  "created_by"    integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by"    integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at"    timestamp NOT NULL DEFAULT now(),
  "updated_at"    timestamp NOT NULL DEFAULT now(),
  -- A page target names a page; the users target does not.
  CONSTRAINT "import_target_page_slug" CHECK (("handler" = 'page') = ("page_slug" IS NOT NULL))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "import_field_alias_master_t" (
  "id"         serial PRIMARY KEY,
  "target_id"  integer NOT NULL REFERENCES "import_target_master_t"("id") ON DELETE CASCADE,
  "field_name" varchar(100) NOT NULL,
  "alias"      varchar(150) NOT NULL,
  "created_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_import_field_alias" ON "import_field_alias_master_t" ("target_id", "alias");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "import_batch_t" (
  "id"            serial PRIMARY KEY,
  "target_key"    varchar(60) NOT NULL,
  "file_name"     varchar(255) NOT NULL,
  "source"        varchar(20) NOT NULL CHECK ("source" IN ('spreadsheet', 'document')),
  "status"        varchar(20) NOT NULL DEFAULT 'parsed' CHECK ("status" IN ('parsed', 'committed', 'failed')),
  "row_count"     integer NOT NULL DEFAULT 0,
  "created_count" integer NOT NULL DEFAULT 0,
  "failed_count"  integer NOT NULL DEFAULT 0,
  "mapping"       jsonb,
  "created_by"    integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at"    timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_batch_t_created" ON "import_batch_t" ("created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "import_batch_row_t" (
  "id"         serial PRIMARY KEY,
  "batch_id"   integer NOT NULL REFERENCES "import_batch_t"("id") ON DELETE CASCADE,
  "row_number" integer NOT NULL,
  "values"     jsonb,
  "record_id"  integer,
  "error"      text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_batch_row_t_batch" ON "import_batch_row_t" ("batch_id");
--> statement-breakpoint

-- The modules on offer. A page target borrows that page's fields, so this row
-- only says WHICH page; adding a field to the form makes it importable with no
-- change here. The menu is what the operator's Import permission is checked on.
INSERT INTO "import_target_master_t" ("target_key", "name", "handler", "page_slug", "menu_url", "hint", "display_order")
SELECT v.* FROM (VALUES
  ('clients',         'Clients',          'page',  'clients',         '/masters/clients',  'One row per client — company name, short code, contact details.', 10),
  ('license',         'Licenses',         'page',  'license',         '/licenses',         'One row per licence — client, kind, goods, transport, FOB and weight.', 20),
  ('import',          'Import Tracking',  'page',  'import',          '/imports',          'One row per import file — client, licence and the consignment details.', 30),
  ('export',          'Export Tracking',  'page',  'export',          '/exports',          'One row per export file — client, licence and the consignment details.', 40),
  ('local',           'Local Tracking',   'page',  'local',           '/local',            'One row per local movement — client, office, truck and weight.', 50),
  ('quotation',       'Quotations',       'page',  'quotation',       '/quotations',       'One row per quotation header. Priced lines are added on the quotation itself.', 60),
  ('import-invoices', 'Import Invoices',  'page',  'import-invoices', '/import-invoices',  'One row per invoice header. Files and lines are chosen on the invoice itself.', 70),
  ('export-invoices', 'Export Invoices',  'page',  'export-invoices', '/export-invoices',  'One row per invoice header. Files and lines are chosen on the invoice itself.', 80),
  ('payment',         'Payment Requests', 'page',  'payment',         '/payments',         'One row per request — requestee, department, amount and what it is for.', 90),
  ('fiche',           'Fiches de Calcul', 'page',  'fiche',           '/fiches',           'One row per fiche header. Tariff lines are added on the fiche itself.', 100),
  ('users',           'Users',            'users', NULL,              '/masters/users',    'One row per person — name, username, email and role. A scanned ID card creates one user.', 110)
) AS v(target_key, name, handler, page_slug, menu_url, hint, display_order)
WHERE NOT EXISTS (SELECT 1 FROM "import_target_master_t" t WHERE t."target_key" = v.target_key);
--> statement-breakpoint

-- The screen itself, beside the other bulk tools.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT NULL, 94, 0, 'Data Import', '/data-import', 'ti ti-file-import', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM "menu_master_t" WHERE "url" = '/data-import');
--> statement-breakpoint

-- Opening the screen is one permission; what may actually be imported is the
-- Import flag on each target module's own menu, so this grants nothing by itself.
INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_import")
SELECT 1, m."id", true, true, true, true, true
FROM "menu_master_t" m
WHERE m."url" = '/data-import'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_mapping_t" r WHERE r."role_id" = 1 AND r."menu_id" = m."id"
  );
--> statement-breakpoint

-- The Super Admin can import into the seeded targets; other roles are granted
-- the Import flag per module under Mapping → Role to Menu.
UPDATE "role_menu_mapping_t" r
SET "can_import" = true, "updated_at" = now()
FROM "menu_master_t" m
WHERE m."id" = r."menu_id" AND r."role_id" = 1 AND r."can_import" IS DISTINCT FROM true
  AND m."url" IN (SELECT DISTINCT "menu_url" FROM "import_target_master_t");
