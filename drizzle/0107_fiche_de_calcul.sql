-- §2 step 3 — Fiche de Calcul (Tracking Management → Fiche de Calcul).
--
-- The duty calculation raised on ONE import file: licence → MCA reference,
-- header figures copied off the file, lines per HS code with CIF and DDI.
-- Ported from main's fiche_de_calculs + fiche_items. Everything that could
-- change without a deploy is configuration:
--
--   * the arithmetic      → tax_rule_master_t  fiche.cif / fiche.coefficient /
--                                              fiche.item_cif / fiche.item_ddi
--   * the status flow     → workflow_master_t  fiche_de_calcul
--                           (created → verified → audited)
--   * the reference       → mca_ref_format_master_t target 'fiche'
--                           (FICHE-<MCA ref>, main's format)
--   * the form            → master_page 'fiche' and its fields
--
-- See src/db/queries/fiches.ts and src/lib/fiche/calc.ts.

-- 1. The table. Lines are a JSONB column (§4.5): read with the fiche, saved by
-- its one Save, never reported on across fiches.
CREATE TABLE IF NOT EXISTS "fiche_de_calcul_t" (
  "id"                          serial PRIMARY KEY,
  "license_id"                  integer REFERENCES "license_t"("id"),
  "import_id"                   integer REFERENCES "imports_t"("id"),
  "fiche_reference"             varchar(150),
  "fiche_date"                  date,
  "regime_id"                   integer REFERENCES "regime_master_t"("id"),
  "currency_id"                 integer REFERENCES "currency_master_t"("id"),
  "transport_mode_id"           integer REFERENCES "transport_mode_master_t"("id"),
  "poids"                       numeric(15,2),
  "tx_de_change"                numeric(18,6),
  "fob"                         numeric(15,2),
  "fob_currency_id"             integer REFERENCES "currency_master_t"("id"),
  "insurance_amount"            numeric(15,2),
  "insurance_currency_id"       integer REFERENCES "currency_master_t"("id"),
  "fret"                        numeric(15,2),
  "fret_currency_id"            integer REFERENCES "currency_master_t"("id"),
  "autres_charges"              numeric(15,2),
  "autres_charges_currency_id"  integer REFERENCES "currency_master_t"("id"),
  "usd_to_currency_rate"        numeric(18,6) DEFAULT 1,
  "provence"                    varchar(100),
  "incoterm_id"                 integer REFERENCES "incoterm_master_t"("id"),
  "cif"                         numeric(18,2),
  "coefficient"                 numeric(18,6),
  "items"                       jsonb DEFAULT '[]'::jsonb,
  "state"                       varchar(100),
  "verified_by"                 integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "verified_at"                 timestamp,
  "audited_by"                  integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "audited_at"                  timestamp,
  "display"                     varchar(1) NOT NULL DEFAULT 'Y',
  "created_by"                  integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by"                  integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at"                  timestamp NOT NULL DEFAULT now(),
  "updated_at"                  timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- One live fiche per import file — main's "already used for creating a fiche".
CREATE UNIQUE INDEX IF NOT EXISTS "uq_fiche_de_calcul_t_import"
  ON "fiche_de_calcul_t" ("import_id") WHERE "display" = 'Y';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_fiche_de_calcul_t_reference"
  ON "fiche_de_calcul_t" ("fiche_reference") WHERE "display" = 'Y';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fiche_de_calcul_t_license" ON "fiche_de_calcul_t" ("license_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fiche_de_calcul_t_state" ON "fiche_de_calcul_t" ("state");
--> statement-breakpoint

-- 2. The field type for the lines. A CHECK cannot be extended in place, so the
-- whole list is restated (§4.5; previous list in 0105).
ALTER TABLE "master_page_accordion_field_t"
  DROP CONSTRAINT IF EXISTS "master_page_accordion_field_t_field_type_check";
--> statement-breakpoint
ALTER TABLE "master_page_accordion_field_t"
  ADD CONSTRAINT "master_page_accordion_field_t_field_type_check"
  CHECK ("field_type" IN (
    'text', 'textarea', 'email', 'tel', 'number', 'date', 'select',
    'checkbox-group', 'file', 'seal-picker', 'remark-log',
    'partielle-picker', 'mca-grid', 'quotation-items', 'invoice-grid',
    'invoice-files', 'fiche-items'
  ));
--> statement-breakpoint

-- 3. The reference: a seventh configured reference (§4.33), FICHE-<MCA ref>.
ALTER TABLE "mca_ref_format_master_t"
  DROP CONSTRAINT IF EXISTS "mca_ref_format_master_t_target_key_check";
--> statement-breakpoint
ALTER TABLE "mca_ref_format_master_t"
  ADD CONSTRAINT "mca_ref_format_master_t_target_key_check"
  CHECK ("target_key" IN (
    'import', 'export', 'license', 'local', 'export-invoice', 'import-invoice',
    'partielle', 'fiche'
  ));
--> statement-breakpoint
INSERT INTO "mca_ref_format_master_t" ("target_key", "format_name", "segments", "display")
SELECT 'fiche', 'Fiche de Calcul — Fiche Reference',
       '[{"type":"literal","value":"FICHE"},{"type":"mca","separator":"-"}]'::jsonb, 'Y'
WHERE NOT EXISTS (SELECT 1 FROM "mca_ref_format_master_t" WHERE "target_key" = 'fiche');
--> statement-breakpoint

-- 4. The arithmetic (§4.2) — main's formulas as JSON Logic. Edit under
-- Masters → Tax Rules; the screen and the save route both read these rows.
--   CIF   = FOB + (fret + insurance + other) × (1 if USD, else the USD rate)
--   coef  = CIF ÷ FOB, or 1 without a FOB
--   CIF/l = FOB/l × coef
--   DDI/l = ⌊CIF/l × exchange rate × DDI% ÷ 100⌋   (floor as x − x mod 1)
INSERT INTO "tax_rule_master_t" ("rule_key", "name", "description", "jurisdiction", "scope", "formula", "display_order")
SELECT v.rule_key, v.name, v.description, 'DRC', 'fiche', v.formula::jsonb, v.ord
FROM (VALUES
  ('fiche.cif', 'Fiche — CIF',
   'FOB plus fret, insurance and other charges; the charges are converted at the USD rate when the fiche is not in USD. Context: entity.fob, fret, insurance, autres_charges, usd_rate, is_usd.',
   '{"+":[{"var":"entity.fob"},{"*":[{"+":[{"var":"entity.fret"},{"var":"entity.insurance"},{"var":"entity.autres_charges"}]},{"if":[{"var":"entity.is_usd"},1,{"var":"entity.usd_rate"}]}]}]}',
   100),
  ('fiche.coefficient', 'Fiche — Coefficient',
   'CIF divided by FOB, or 1 when there is no FOB. Context: entity.fob, entity.cif.',
   '{"if":[{">":[{"var":"entity.fob"},0]},{"/":[{"var":"entity.cif"},{"var":"entity.fob"}]},1]}',
   110),
  ('fiche.item_cif', 'Fiche — CIF par article',
   'A line''s FOB times the fiche coefficient. Context: entity.fob_article, entity.coef.',
   '{"*":[{"var":"entity.fob_article"},{"var":"entity.coef"}]}',
   120),
  ('fiche.item_ddi', 'Fiche — DDI en FC',
   'A line''s import duty in CDF: CIF × exchange rate × DDI % ÷ 100, rounded down. Context: entity.cif_article, tx_de_change, ddi_percent.',
   '{"-":[{"/":[{"*":[{"var":"entity.cif_article"},{"var":"entity.tx_de_change"},{"var":"entity.ddi_percent"}]},100]},{"%":[{"/":[{"*":[{"var":"entity.cif_article"},{"var":"entity.tx_de_change"},{"var":"entity.ddi_percent"}]},100]},1]}]}',
   130)
) AS v(rule_key, name, description, formula, ord)
WHERE NOT EXISTS (SELECT 1 FROM "tax_rule_master_t" t WHERE t."rule_key" = v.rule_key);
--> statement-breakpoint

-- 5. The status flow (§4.6). A fiche can be edited or deleted while its state
-- still has a transition out of it, so the last state locks it. Each step
-- stamps who took it and when.
INSERT INTO "workflow_master_t" ("workflow_key", "name", "description", "entity_type", "initial_state", "display")
SELECT 'fiche_de_calcul', 'Fiche de Calcul',
       'Created → Verified → Audited. Edit and delete are allowed until the last state.',
       'fiche', 'created', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM "workflow_master_t" WHERE "workflow_key" = 'fiche_de_calcul');
--> statement-breakpoint
INSERT INTO "workflow_transition_master_t" ("workflow_id", "transition_key", "from_state", "to_state", "action_json", "display")
SELECT w."id", v.transition_key, v.from_state, v.to_state, v.action_json::jsonb, 'Y'
FROM "workflow_master_t" w
CROSS JOIN (VALUES
  ('verify', 'created', 'verified',
   '[{"type":"set_field","field":"verified_by","value":{"var":"actor.userId"}},{"type":"set_field","field":"verified_at","value":{"var":"now"}}]'),
  ('audit', 'verified', 'audited',
   '[{"type":"set_field","field":"audited_by","value":{"var":"actor.userId"}},{"type":"set_field","field":"audited_at","value":{"var":"now"}}]')
) AS v(transition_key, from_state, to_state, action_json)
WHERE w."workflow_key" = 'fiche_de_calcul'
  AND NOT EXISTS (
    SELECT 1 FROM "workflow_transition_master_t" t
    WHERE t."workflow_id" = w."id" AND t."transition_key" = v.transition_key
  );
--> statement-breakpoint

-- 6. The transaction page.
INSERT INTO "master_page_t" ("slug", "title", "route", "target_table", "display_order", "display")
SELECT 'fiche', 'Fiche de Calcul', '/fiches', 'fiche_de_calcul_t', 20, 'Y'
WHERE NOT EXISTS (SELECT 1 FROM "master_page_t" WHERE "slug" = 'fiche');
--> statement-breakpoint
INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "display_order", "display")
SELECT p."id", v.slug, v.title, v.icon, v.ord, 'Y'
FROM "master_page_t" p
CROSS JOIN (VALUES
  ('details', 'Fiche Details',     'ti ti-file-text', 1),
  ('items',   'Items Management',  'ti ti-package',   2)
) AS v(slug, title, icon, ord)
WHERE p."slug" = 'fiche'
  AND NOT EXISTS (
    SELECT 1 FROM "master_page_accordion_t" a WHERE a."page_id" = p."id" AND a."slug" = v.slug
  );
--> statement-breakpoint

-- main's four-per-row header (colSpan "3" — a quarter from xl up). The file's figures are prefills (`fiche_file`
-- derive) the operator may correct, as main allowed; regime, transport and the
-- reference are read-only, and CIF / coefficient are written by the lines grid
-- and recomputed on save.
INSERT INTO "master_page_accordion_field_t"
  ("accordion_id", "name", "label", "field_type", "required",
   "options_source", "options_label_field", "props", "derive", "display_order", "display")
SELECT a."id", v.name, v.label, v.field_type, v.required,
       v.options_source, v.options_label_field, v.props::jsonb, v.derive::jsonb, v.ord, 'Y'
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
CROSS JOIN (VALUES
  ('license_id', 'License Number', 'select', true, 'fiches/licenses', 'license_number',
   '{"colSpan":"3","optionsParams":{"current_license":"license_id"}}', NULL, 1),
  ('import_id', 'MCA Reference', 'select', true, 'fiches/files', 'mca_ref',
   '{"colSpan":"3","optionsParams":{"license_id":"license_id","current":"import_id"},"placeholder":"Choose the licence first"}', NULL, 2),
  ('regime_id', 'Regime', 'select', true, 'regimes', 'regime_name',
   '{"colSpan":"3","readOnly":true,"placeholder":"From MCA"}',
   '{"kind":"fromRelated","source":"fiche_file","column":"regime_id","trigger":"import_id"}', 3),
  ('fiche_reference', 'Fiche Reference', 'text', true, NULL, NULL,
   '{"colSpan":"3","readOnly":true,"maxLength":150,"placeholder":"From MCA"}',
   '{"kind":"template","source":"fiche_ref","trigger":["import_id"],"template":"{ref}"}', 4),
  ('fiche_date', 'Fiche Date', 'date', true, NULL, NULL,
   '{"colSpan":"3"}',
   '{"kind":"fromRelated","source":"session","column":"today","trigger":"@init","editable":true}', 5),
  ('currency_id', 'Currency', 'select', true, 'currencies', 'currency_short_name',
   '{"colSpan":"3"}',
   '{"kind":"fromRelated","source":"fiche_file","column":"currency_id","trigger":"import_id","editable":true}', 6),
  ('transport_mode_id', 'Transport Mode', 'select', false, 'transport-modes', 'transport_mode_name',
   '{"colSpan":"3","readOnly":true,"placeholder":"From MCA"}',
   '{"kind":"fromRelated","source":"fiche_file","column":"transport_mode_id","trigger":"import_id"}', 7),
  ('poids', 'Poids (Weight)', 'number', true, NULL, NULL,
   '{"colSpan":"3","min":0,"step":"0.01"}',
   '{"kind":"fromRelated","source":"fiche_file","column":"weight","trigger":"import_id","editable":true}', 8),
  ('tx_de_change', 'Exchange Rate (CDF)', 'number', true, NULL, NULL,
   '{"colSpan":"3","min":0,"step":"0.000001"}',
   '{"kind":"fromRelated","source":"bcc_rate","column":"rate","trigger":"@init","editable":true}', 9),
  ('fob', 'FOB', 'number', true, NULL, NULL,
   '{"colSpan":"3","min":0,"step":"0.01","currencyField":"fob_currency_id"}',
   '{"kind":"fromRelated","source":"fiche_file","column":"fob","trigger":"import_id","editable":true}', 10),
  ('fob_currency_id', 'FOB Currency', 'select', false, 'currencies', 'currency_short_name',
   '{"colSpan":"3"}',
   '{"kind":"fromRelated","source":"fiche_file","column":"fob_currency_id","trigger":"import_id","editable":true}', 11),
  ('insurance_amount', 'Insurance Amount', 'number', false, NULL, NULL,
   '{"colSpan":"3","min":0,"step":"0.01","currencyField":"insurance_currency_id"}',
   '{"kind":"fromRelated","source":"fiche_file","column":"insurance_amount","trigger":"import_id","editable":true}', 12),
  ('insurance_currency_id', 'Insurance Currency', 'select', false, 'currencies', 'currency_short_name',
   '{"colSpan":"3"}',
   '{"kind":"fromRelated","source":"fiche_file","column":"insurance_currency_id","trigger":"import_id","editable":true}', 13),
  ('fret', 'Fret', 'number', false, NULL, NULL,
   '{"colSpan":"3","min":0,"step":"0.01","currencyField":"fret_currency_id"}',
   '{"kind":"fromRelated","source":"fiche_file","column":"fret","trigger":"import_id","editable":true}', 14),
  ('fret_currency_id', 'Fret Currency', 'select', false, 'currencies', 'currency_short_name',
   '{"colSpan":"3"}',
   '{"kind":"fromRelated","source":"fiche_file","column":"fret_currency_id","trigger":"import_id","editable":true}', 15),
  ('autres_charges', 'Other Charges', 'number', false, NULL, NULL,
   '{"colSpan":"3","min":0,"step":"0.01","currencyField":"autres_charges_currency_id"}',
   '{"kind":"fromRelated","source":"fiche_file","column":"other_charges","trigger":"import_id","editable":true}', 16),
  ('autres_charges_currency_id', 'Other Charges Currency', 'select', false, 'currencies', 'currency_short_name',
   '{"colSpan":"3"}',
   '{"kind":"fromRelated","source":"fiche_file","column":"other_charges_currency_id","trigger":"import_id","editable":true}', 17),
  ('usd_to_currency_rate', 'USD to Currency Rate', 'number', false, NULL, NULL,
   '{"colSpan":"3","min":0,"step":"0.000001","defaultValue":1}', NULL, 18),
  ('provence', 'Provence (Origin)', 'text', false, NULL, NULL,
   '{"colSpan":"3","maxLength":100,"placeholder":"Enter origin"}', NULL, 19),
  ('cif', 'CIF', 'number', false, NULL, NULL,
   '{"colSpan":"3","readOnly":true,"step":"0.01","placeholder":"Computed from the lines"}', NULL, 20),
  ('coefficient', 'Coefficient', 'number', false, NULL, NULL,
   '{"colSpan":"3","readOnly":true,"step":"0.000001","placeholder":"CIF ÷ FOB"}', NULL, 21),
  ('incoterm_id', 'INCOTERM', 'select', false, 'incoterms', 'incoterm_short_name',
   '{"colSpan":"3"}', NULL, 22),
  ('incoterm_full', 'INCOTERM Full', 'text', false, NULL, NULL,
   '{"colSpan":"6","readOnly":true,"placeholder":"Full INCOTERM description"}',
   '{"kind":"fromRelated","source":"incoterm","column":"incoterm_full_name","trigger":"incoterm_id"}', 23)
) AS v(name, label, field_type, required, options_source, options_label_field, props, derive, ord)
WHERE p."slug" = 'fiche' AND a."slug" = 'details'
  AND NOT EXISTS (
    SELECT 1 FROM "master_page_accordion_field_t" f WHERE f."accordion_id" = a."id" AND f."name" = v.name
  );
--> statement-breakpoint

INSERT INTO "master_page_accordion_field_t"
  ("accordion_id", "name", "label", "field_type", "required", "props", "display_order", "display")
SELECT a."id", 'items', 'Items', 'fiche-items', true, '{"colSpan":"12","hideLabel":true}'::jsonb, 1, 'Y'
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
WHERE p."slug" = 'fiche' AND a."slug" = 'items'
  AND NOT EXISTS (
    SELECT 1 FROM "master_page_accordion_field_t" f WHERE f."accordion_id" = a."id" AND f."name" = 'items'
  );
--> statement-breakpoint

INSERT INTO "master_page_accordion_role_t" ("accordion_id", "role_id", "permission")
SELECT a."id", 1, 'edit'
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
WHERE p."slug" = 'fiche'
  AND NOT EXISTS (
    SELECT 1 FROM "master_page_accordion_role_t" r WHERE r."accordion_id" = a."id" AND r."role_id" = 1
  );
--> statement-breakpoint

-- 7. The menu, beside the tracking screens, with the Super Admin's grant.
-- Verify / Audit are gated on can_approve.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 42, 1, 'Fiche de Calcul', '/fiches', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Tracking Management' AND p."menu_level" = 0
  AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/fiches');
--> statement-breakpoint
INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve", "can_export", "can_print")
SELECT 1, m."id", true, true, true, true, true, true, true
FROM "menu_master_t" m
WHERE m."url" = '/fiches'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_mapping_t" r WHERE r."role_id" = 1 AND r."menu_id" = m."id"
  );
