-- Invoice Template master — the invoice PDF designs as configuration (§4.1).
--
-- `import_invoices_t.invoice_template` has existed since the port and NOTHING
-- has ever read it: the print builder carried one hardcoded layout, so the
-- field was stored, derived from the client and validated while changing
-- nothing — the same defect §4.24 records for `favicon_url`. Its options were
-- the static pair Include / Exclude, which does not describe a PDF design.
--
-- A row now names one of a VETTED set of layouts the renderer can draw and
-- carries the options that layout reads (colour, title, tagline, terms, footer,
-- which blocks show). Two house styles in one layout and two colours are two
-- rows, not two code paths — §4.33's rule applied to documents.

CREATE TABLE IF NOT EXISTS "invoice_template_master_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "template_code" varchar(5) NOT NULL,
  "template_name" varchar(100) NOT NULL,
  "description" varchar(255),
  "layout" varchar(30) NOT NULL,
  "options" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "display" varchar(1) DEFAULT 'Y' NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "invoice_template_master_t"
    ADD CONSTRAINT "invoice_template_master_t_created_by_users_t_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users_t"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "invoice_template_master_t"
    ADD CONSTRAINT "invoice_template_master_t_updated_by_users_t_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "users_t"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- The code is what each invoice stores, so two live templates cannot share one:
-- a reprint has to resolve to exactly one design. Partial on display='Y' so a
-- retired code can be reused (§4.27).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_invoice_template_code"
  ON "invoice_template_master_t" ("template_code") WHERE "display" = 'Y';
--> statement-breakpoint

-- At most ONE default. Two rows claiming it resolves to whichever the query
-- happens to return first, which is a different invoice design depending on
-- the plan Postgres picked.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_invoice_template_single_default"
  ON "invoice_template_master_t" (("is_default")) WHERE "is_default" AND "display" = 'Y';
--> statement-breakpoint

-- Three templates to start: the facture as it prints today (so nothing changes
-- for anyone who does not go looking), and the two coloured house styles — the
-- SAME layout in two accents, which is the whole point of colour being an
-- option rather than a layout.
INSERT INTO "invoice_template_master_t"
  ("template_code", "template_name", "description", "layout", "options", "is_default")
SELECT * FROM (VALUES
  ('CLSC', 'Classic Facture',
   'The bordered DRC facture exactly as it printed before templates existed.',
   'classic', '{}'::jsonb, true),
  ('MODP', 'Modern Purple',
   'Accent header bar, tinted item rows, terms and payment blocks, coloured contact strip.',
   'modern',
   '{"title":"INVOICE","accentColor":"#7B3F9E","tagline":"Customs Clearance & Logistics",
     "termsText":"Payment is due within 30 days of the invoice date. Goods remain the property of the consignor until settled in full.",
     "footerText":"Thank you for your business!",
     "contactLine":"No. 1068, Avenue Ruwe, Quartier Makutano, Lubumbashi, DRC · RCCM: 13-B-1122 · NIF: A 1309334 L"}'::jsonb,
   false),
  ('MODB', 'Modern Blue',
   'The Modern layout in the corporate blue accent.',
   'modern',
   '{"title":"INVOICE","accentColor":"#1B95D1","tagline":"Customs Clearance & Logistics",
     "termsText":"Payment is due within 30 days of the invoice date. Goods remain the property of the consignor until settled in full.",
     "footerText":"Thank you for your business!",
     "contactLine":"No. 1068, Avenue Ruwe, Quartier Makutano, Lubumbashi, DRC · RCCM: 13-B-1122 · NIF: A 1309334 L"}'::jsonb,
   false)
) AS v("template_code", "template_name", "description", "layout", "options", "is_default")
WHERE NOT EXISTS (SELECT 1 FROM "invoice_template_master_t");
--> statement-breakpoint

-- The Import Invoice's Invoice Template dropdown now offers these rows.
--
-- `optionsValueField` makes the select store `template_code` rather than the row
-- id, because the column is varchar(5) and holds the code — an id would be
-- stored as text and resolve to nothing on reprint.
--
-- The `fromRelated` derive is REMOVED with it. It copied
-- `client_master_t.invoice_template`, which is a varchar(1) holding 'I'/'E' —
-- Include/Exclude, a different idea that cannot name a design. Left in place it
-- would prefill the field with a code no template has, and the dropdown would
-- open blank with no way to tell why. The default now comes from the master's
-- `is_default` row instead.
UPDATE "master_page_accordion_field_t" AS f
   SET "options_static" = NULL,
       "options_source" = 'invoice-templates',
       "options_label_field" = 'template_name',
       "derive" = NULL,
       "props" = COALESCE(f."props", '{}'::jsonb)
                 || '{"optionsValueField": "template_code"}'::jsonb
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE a."id" = f."accordion_id"
   AND p."slug" = 'import-invoices'
   AND f."name" = 'invoice_template';
--> statement-breakpoint

-- Existing invoices carry 'I' / 'E', which name no template. Point them at the
-- default so a reprint draws the document it drew before, rather than falling
-- through to the renderer's own fallback by accident.
UPDATE "import_invoices_t"
   SET "invoice_template" = (
         SELECT "template_code" FROM "invoice_template_master_t"
          WHERE "is_default" AND "display" = 'Y' LIMIT 1)
 WHERE "invoice_template" IS NULL
    OR "invoice_template" NOT IN (
         SELECT "template_code" FROM "invoice_template_master_t" WHERE "display" = 'Y');
--> statement-breakpoint

-- The master screen's sidebar entry. Parent resolved BY NAME (the 0089
-- pattern): on a fresh database menus are seeded after migrations run, so this
-- is a silent no-op there and seedMenus carries the same row.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 107, 1, 'Invoice Template', '/masters/invoice-templates', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Masters' AND p."menu_level" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/masters/invoice-templates'
  );
--> statement-breakpoint

-- §4.7 — the menu URL IS the permission resource, so a new screen with no
-- mapping row is denied to everyone, Super Admin included. Granted exactly as
-- Invoice Bank is: the same people who maintain how an invoice is billed
-- maintain how it looks.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", d."id",
       r."can_view", r."can_add", r."can_edit", r."can_delete", r."can_approve",
       r."can_restore", r."can_permanent_delete", r."can_export", r."can_import", r."can_print",
       r."can_view_audit", r."can_export_audit", r."can_manage_settings"
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" src ON src."id" = r."menu_id" AND src."url" = '/masters/invoice-banks'
  JOIN "menu_master_t" d ON d."url" = '/masters/invoice-templates'
 WHERE NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
