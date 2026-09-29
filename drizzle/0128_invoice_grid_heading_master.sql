-- Invoice grid column headings as configuration (§4.1).
--
-- "Taux/USD", "Total en USD", "CIF/Split", "Rate/CDF" are the operators' own
-- vocabulary — half French, half English — and every one of them was spelled
-- out in JSX, in TWO places: the editable grid and the printed facture. Renaming
-- a column meant editing both and hoping they matched, which is exactly the
-- drift §4.10 exists to stop.
--
-- WHICH columns exist stays vetted in src/lib/invoiceGrid/columns.ts: a column
-- key names a field the renderer reads off a line, so an operator renames a
-- column and cannot invent one the grid has no value for (§4.33's rule).

CREATE TABLE IF NOT EXISTS "invoice_grid_heading_master_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "grid_key" varchar(30) NOT NULL,
  "column_key" varchar(30) NOT NULL,
  "category_id" integer,
  "heading" varchar(60) NOT NULL,
  "display" varchar(1) DEFAULT 'Y' NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "invoice_grid_heading_master_t"
    ADD CONSTRAINT "invoice_grid_heading_master_t_created_by_users_t_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users_t"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "invoice_grid_heading_master_t"
    ADD CONSTRAINT "invoice_grid_heading_master_t_updated_by_users_t_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "users_t"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- One heading per column per category override.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_invoice_grid_heading_scoped"
  ON "invoice_grid_heading_master_t" ("grid_key", "column_key", "category_id")
  WHERE "display" = 'Y' AND "category_id" IS NOT NULL;
--> statement-breakpoint

-- And one GENERAL heading per column. A separate partial index because NULL
-- never compares equal to NULL in a unique index, so the index above would let
-- two unscoped rows for the same column coexist — and the grid would then take
-- whichever the plan returned first.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_invoice_grid_heading_general"
  ON "invoice_grid_heading_master_t" ("grid_key", "column_key")
  WHERE "display" = 'Y' AND "category_id" IS NULL;
--> statement-breakpoint

-- Seeded with exactly the labels the grid renders today, so nothing changes on
-- screen until somebody edits a row. The ordering here is the order the columns
-- are drawn in; the master edits the NAMES, not the layout.
INSERT INTO "invoice_grid_heading_master_t" ("grid_key", "column_key", "heading")
SELECT * FROM (VALUES
  ('import-cdf', 'description', 'Description'),
  ('import-cdf', 'unit',        'Unit'),
  ('import-cdf', 'cif_split',   'CIF/Split'),
  ('import-cdf', 'percentage',  '%'),
  ('import-cdf', 'rate_cdf',    'Rate/CDF'),
  ('import-cdf', 'vat_cdf',     'VAT/CDF'),
  ('import-cdf', 'total_cdf',   'Total/CDF'),

  ('import-usd', 'description', 'Description'),
  ('import-usd', 'unit',        'Unit'),
  ('import-usd', 'quantity',    'Qty'),
  ('import-usd', 'taux_usd',    'Taux/USD'),
  ('import-usd', 'currency',    'Currency'),
  ('import-usd', 'tva',         'TVA'),
  ('import-usd', 'tva_usd',     'TVA/USD'),
  ('import-usd', 'total_usd',   'Total en USD'),

  ('export-usd', 'description',  'Description'),
  ('export-usd', 'unit',         'Unit'),
  ('export-usd', 'quantity',     'Qty'),
  ('export-usd', 'cost_usd',     'Cost/USD'),
  ('export-usd', 'tva',          'TVA'),
  ('export-usd', 'subtotal_usd', 'Subtotal USD'),
  ('export-usd', 'tva_16',       'TVA 16%'),
  ('export-usd', 'total_usd',    'Total USD')
) AS v("grid_key", "column_key", "heading")
WHERE NOT EXISTS (SELECT 1 FROM "invoice_grid_heading_master_t");
--> statement-breakpoint

-- The master screen's sidebar entry. Parent resolved BY NAME (the 0089
-- pattern): on a fresh database menus are seeded after migrations run, so this
-- is a silent no-op there and seedMenus carries the same row.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 108, 1, 'Invoice Grid Headings', '/masters/invoice-grid-headings', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Masters' AND p."menu_level" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/masters/invoice-grid-headings'
  );
--> statement-breakpoint

-- §4.7 — the menu URL IS the permission resource, so a new screen with no
-- mapping row is denied to everyone, Super Admin included. Granted as the
-- Invoice Template master is: the same people who decide how an invoice looks
-- decide what its columns are called.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", d."id",
       r."can_view", r."can_add", r."can_edit", r."can_delete", r."can_approve",
       r."can_restore", r."can_permanent_delete", r."can_export", r."can_import", r."can_print",
       r."can_view_audit", r."can_export_audit", r."can_manage_settings"
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" src ON src."id" = r."menu_id" AND src."url" = '/masters/invoice-templates'
  JOIN "menu_master_t" d ON d."url" = '/masters/invoice-grid-headings'
 WHERE NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
