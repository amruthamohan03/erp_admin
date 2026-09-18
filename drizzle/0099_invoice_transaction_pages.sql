-- §2 step 5 / §4.12 / §4.17 — Import and Export invoices laid out as main's
-- importinvoice.php / exportinvoice.php, on the transaction-page runtime.
--
-- What changes, per page:
--
--   EXPORT — the MCA + items grid moves INTO the form (the `invoice_grid` field,
--   kind 'export'), which removes the second Save that sat below the page (§4.17;
--   Import had the same fix in 0096). Header gains Mode de paiement and the BCC
--   rate; Invoice Date opens on today and is not typed; Kind / Goods / Transport
--   are filled from the MCA files, not picked. Comments A–H get their own section.
--
--   IMPORT — the header keeps its fields; the Financial section follows main's
--   panel (FOB / Fret / Assurance / Autres each with its currency, DGDA rate,
--   BCC rate, CIF and CIF-in-CDF computed, duty, weight, tariff code); new
--   Transport, Documents and Comments sections carry the ~30 header columns the
--   form never exposed. Transport fields appear per mode, M3 only for fuel.
--
--   BOTH — the DGI code / amount fields leave the form. main does not show them
--   there (the e-MCF submission owns them) and the list's DGI flow sets them.
--
-- Idempotent: every field is defined once in a staging table, then UPDATED in
-- place when the page already has it (moving it to its section) or INSERTED when
-- it does not. Re-running changes nothing.

-- 1. Sections -----------------------------------------------------------------
INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "display_order", "display")
SELECT p."id", v.slug, v.title, v.icon, v.ord, 'Y'
FROM "master_page_t" p
JOIN (VALUES
  ('import-invoices', 'transport', 'Transport',       'ti ti-truck',          3),
  ('import-invoices', 'documents', 'Documents',       'ti ti-file-text',      4),
  ('import-invoices', 'comments',  'Comments',        'ti ti-message-2',      5),
  ('export-invoices', 'comments',  'Comments',        'ti ti-message-2',      2),
  ('export-invoices', 'items',     'MCA References & Items', 'ti ti-list-details', 3)
) AS v(page, slug, title, icon, ord) ON v.page = p."slug"
WHERE NOT EXISTS (
  SELECT 1 FROM "master_page_accordion_t" a WHERE a."page_id" = p."id" AND a."slug" = v.slug
);
--> statement-breakpoint

-- Section order and titles, main's reading order: header, financials, transport,
-- documents, comments, then the files and lines.
UPDATE "master_page_accordion_t" a
SET "display_order" = v.ord, "title" = v.title
FROM "master_page_t" p,
     (VALUES
       ('import-invoices', 'header',    'Invoice Header',          1),
       ('import-invoices', 'financial', 'Financial Info',          2),
       ('import-invoices', 'transport', 'Transport',               3),
       ('import-invoices', 'documents', 'Documents',               4),
       ('import-invoices', 'comments',  'Comments',                5),
       ('import-invoices', 'items',     'Quotation & MCA Files',   6),
       ('export-invoices', 'header',    'Invoice Header',          1),
       ('export-invoices', 'comments',  'Comments',                2),
       ('export-invoices', 'items',     'MCA References & Items',  3)
     ) AS v(page, slug, title, ord)
WHERE a."page_id" = p."id" AND p."slug" = v.page AND a."slug" = v.slug;
--> statement-breakpoint

-- §4.7 — a section with no grant is invisible to every role. Each new section
-- gets exactly the grants the page's header section already has, so it appears
-- for the same roles and no one else.
INSERT INTO "master_page_accordion_role_t" ("accordion_id", "role_id", "permission")
SELECT a."id", r."role_id", r."permission"
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
JOIN "master_page_accordion_t" h ON h."page_id" = p."id" AND h."slug" = 'header'
JOIN "master_page_accordion_role_t" r ON r."accordion_id" = h."id"
WHERE p."slug" IN ('import-invoices', 'export-invoices')
  AND a."slug" <> 'header'
  AND NOT EXISTS (
    SELECT 1 FROM "master_page_accordion_role_t" x
    WHERE x."accordion_id" = a."id" AND x."role_id" = r."role_id"
  );
--> statement-breakpoint

-- 2. Fields -------------------------------------------------------------------
DROP TABLE IF EXISTS "_invoice_field_spec";
--> statement-breakpoint

CREATE TEMP TABLE "_invoice_field_spec" (
  page text, acc text, name text, label text, field_type text, required boolean,
  options_source text, options_label_field text, options_static jsonb,
  props jsonb, derive jsonb, conditions jsonb, ord int
);
--> statement-breakpoint

INSERT INTO "_invoice_field_spec" VALUES
  -- ── EXPORT · header ─────────────────────────────────────────────────────
  ('export-invoices','header','client_id','Client','select',true,'clients','short_name',NULL,
    '{"colSpan":"5-per-row"}',NULL,NULL,1),
  ('export-invoices','header','license_id','License Number','select',true,'licenses','license_number',NULL,
    '{"colSpan":"5-per-row","optionsParams":{"client_id":"client_id"}}',NULL,NULL,2),
  ('export-invoices','header','invoice_ref','Invoice Reference','text',true,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","maxLength":100,"placeholder":"Enter or auto-generated"}',
    '{"kind":"template","source":"export_invoice_ref","trigger":["client_id"],"editable":true,"template":"{ref}"}',NULL,3),
  -- main: dated today and not typed.
  ('export-invoices','header','invoice_date','Invoice Date','date',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","readOnly":true}',
    '{"kind":"fromRelated","source":"session","column":"today","trigger":"@init","editable":true}',NULL,4),
  ('export-invoices','header','arsp','ARSP','select',false,NULL,NULL,
    '[{"value":"Disabled","label":"Disabled"},{"value":"Enabled","label":"Enabled"}]',
    '{"colSpan":"5-per-row","defaultValue":"Disabled"}',NULL,NULL,5),
  -- Filled from the first MCA file picked (main's getMCADetails).
  ('export-invoices','header','kind_id','Kind','select',false,'kinds?group=export','kind_name',NULL,
    '{"colSpan":"5-per-row","readOnly":true,"placeholder":"Select MCA to auto-fill"}',NULL,NULL,6),
  ('export-invoices','header','goods_type_id','Type of Goods','select',false,'goods-types','goods_type',NULL,
    '{"colSpan":"5-per-row","readOnly":true,"placeholder":"Select MCA to auto-fill"}',NULL,NULL,7),
  ('export-invoices','header','transport_mode_id','Transport Mode','select',false,'transport-modes','transport_mode_name',NULL,
    '{"colSpan":"5-per-row","readOnly":true,"placeholder":"Select MCA to auto-fill"}',NULL,NULL,8),
  ('export-invoices','header','payment_mode','Mode de paiement','select',true,NULL,NULL,
    '[{"value":"ESPECE","label":"ESPECE"},{"value":"MOBILE MONEY","label":"MOBILE MONEY"},{"value":"VIREMENT","label":"VIREMENT"},{"value":"CARTE BANCAIRE","label":"CARTE BANCAIRE"},{"value":"CHEQUES","label":"CHEQUES"},{"value":"CREDIT","label":"CREDIT"},{"value":"AUTRE","label":"AUTRE"}]',
    '{"colSpan":"5-per-row","defaultValue":"CREDIT"}',NULL,NULL,9),
  -- The BCC rate on the invoice date, re-read when the date changes; editable.
  ('export-invoices','header','live_bcc_rate','BCC Rate','number',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","min":0,"step":"0.0001","placeholder":"Auto-fetched"}',
    '{"kind":"fromRelated","source":"bcc_rate","column":"rate","trigger":["@init","invoice_date"],"editable":true}',NULL,10),

  -- ── EXPORT · comments ───────────────────────────────────────────────────
  ('export-invoices','comments','cmta','Comment A','text',false,NULL,NULL,NULL,
    '{"colSpan":"4-per-row","maxLength":100,"readOnly":true,"placeholder":"AO clients only, sent to DGI if filled"}',NULL,NULL,1),
  ('export-invoices','comments','cmtb','Comment B','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100,"placeholder":"Comment B"}',NULL,NULL,2),
  ('export-invoices','comments','cmtc','Comment C','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100,"placeholder":"Comment C"}',NULL,NULL,3),
  ('export-invoices','comments','cmtd','Comment D','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100,"placeholder":"Comment D"}',NULL,NULL,4),
  ('export-invoices','comments','cmte','Comment E','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100,"placeholder":"Comment E"}',NULL,NULL,5),
  ('export-invoices','comments','cmtf','Comment F','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100,"placeholder":"Comment F"}',NULL,NULL,6),
  ('export-invoices','comments','cmtg','Comment G','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100,"placeholder":"Comment G"}',NULL,NULL,7),
  ('export-invoices','comments','cmth','Comment H','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100,"placeholder":"Comment H"}',NULL,NULL,8),

  -- ── EXPORT · items ──────────────────────────────────────────────────────
  ('export-invoices','items','invoice_grid','MCA References & Items','invoice-grid',false,NULL,NULL,NULL,
    '{"colSpan":"12","kind":"export"}',NULL,NULL,1),

  -- ── IMPORT · header ─────────────────────────────────────────────────────
  ('import-invoices','header','client_id','Client','select',true,'clients','short_name',NULL,
    '{"colSpan":"5-per-row"}',NULL,NULL,1),
  ('import-invoices','header','invoice_ref','Invoice Ref','text',true,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","maxLength":100}',
    '{"kind":"template","source":"import_invoice_ref","trigger":["client_id"],"editable":true,"template":"{ref}"}',NULL,2),
  ('import-invoices','header','payment_method','Mode de paiement','select',true,NULL,NULL,
    '[{"value":"ESPECE","label":"ESPECE"},{"value":"MOBILE MONEY","label":"MOBILE MONEY"},{"value":"VIREMENT","label":"VIREMENT"},{"value":"CARTE BANCAIRE","label":"CARTE BANCAIRE"},{"value":"CHEQUES","label":"CHEQUES"},{"value":"CREDIT","label":"CREDIT"},{"value":"AUTRE","label":"AUTRE"}]',
    '{"colSpan":"5-per-row","defaultValue":"CREDIT"}',NULL,NULL,3),
  ('import-invoices','header','arsp','ARSP','text',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","maxLength":20,"defaultValue":"Disabled","placeholder":"Disabled"}',NULL,NULL,4),
  -- Filled from the MCA files' licence (main's loadMCADetails).
  ('import-invoices','header','kind_id','Kind','select',false,'kinds?group=import','kind_name',NULL,
    '{"colSpan":"5-per-row","readOnly":true,"placeholder":"From MCA"}',NULL,NULL,5),
  ('import-invoices','header','goods_type_id','Type of Goods','select',false,'goods-types','goods_type',NULL,
    '{"colSpan":"5-per-row","readOnly":true,"placeholder":"From MCA"}',NULL,NULL,6),
  ('import-invoices','header','transport_mode_id','Transport Mode','select',false,'transport-modes','transport_mode_name',NULL,
    '{"colSpan":"5-per-row","readOnly":true,"placeholder":"From MCA"}',NULL,NULL,7),
  -- Defaults to the client's own template, still changeable per invoice.
  ('import-invoices','header','invoice_template','Invoice Template','select',false,NULL,NULL,
    '[{"label":"Include","value":"I"},{"label":"Exclude","value":"E"}]',
    '{"colSpan":"5-per-row"}',
    '{"kind":"fromRelated","source":"client","column":"invoice_template","trigger":"client_id","editable":true}',NULL,8),

  -- ── IMPORT · financial ──────────────────────────────────────────────────
  ('import-invoices','financial','fob_usd','FOB','number',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","min":0,"step":"0.01","currencyField":"fob_currency_id"}',NULL,NULL,1),
  ('import-invoices','financial','fob_currency_id','FOB Currency','select',false,'currencies','currency_short_name',NULL,
    '{"colSpan":"5-per-row"}',NULL,NULL,2),
  ('import-invoices','financial','fret_usd','FRET','number',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","min":0,"step":"0.01","currencyField":"fret_currency_id"}',NULL,NULL,3),
  ('import-invoices','financial','fret_currency_id','FRET Currency','select',false,'currencies','currency_short_name',NULL,
    '{"colSpan":"5-per-row"}',NULL,NULL,4),
  ('import-invoices','financial','assurance_usd','Assurance','number',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","min":0,"step":"0.01","currencyField":"assurance_currency_id"}',NULL,NULL,5),
  ('import-invoices','financial','assurance_currency_id','Assurance Currency','select',false,'currencies','currency_short_name',NULL,
    '{"colSpan":"5-per-row"}',NULL,NULL,6),
  ('import-invoices','financial','autres_charges_usd','Autres Charges','number',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","min":0,"step":"0.01","currencyField":"autres_charges_currency_id"}',NULL,NULL,7),
  ('import-invoices','financial','autres_charges_currency_id','Autres Charges Currency','select',false,'currencies','currency_short_name',NULL,
    '{"colSpan":"5-per-row"}',NULL,NULL,8),
  ('import-invoices','financial','rate_cdf_inv','DGDA Rate','number',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","min":0,"step":"0.0001"}',NULL,NULL,9),
  ('import-invoices','financial','rate_cdf_usd_bcc','Rate CDF/BCC','number',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","min":0,"step":"0.0001"}',
    '{"kind":"fromRelated","source":"bcc_rate","column":"rate","trigger":"@init","editable":true}',NULL,10),
  -- main's calculateFinancials: CIF = FOB + Fret + Assurance + Autres; CIF in
  -- CDF at the DGDA rate. Computed, recomputed by the server on save.
  ('import-invoices','financial','cif_usd','CIF','number',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","step":"0.01"}',
    '{"kind":"formula","op":"sum","fields":["fob_usd","fret_usd","assurance_usd","autres_charges_usd"],"decimals":2}',NULL,11),
  ('import-invoices','financial','cif_cdf','CIF CDF','number',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","step":"0.01"}',
    '{"kind":"formula","op":"multiply","fields":["cif_usd","rate_cdf_inv"],"decimals":2}',NULL,12),
  ('import-invoices','financial','total_duty_cdf','Duty CDF','number',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","min":0,"step":"0.01"}',NULL,NULL,13),
  ('import-invoices','financial','poids_kg','Poids (Kg)','number',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","min":0,"step":"0.01"}',NULL,NULL,14),
  ('import-invoices','financial','tariff_code_client','Tariff Code','text',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","maxLength":100}',NULL,NULL,15),

  -- ── IMPORT · transport (per mode: 1 road, 2 air, 3 wagon) ───────────────
  ('import-invoices','transport','horse','Horse','text',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","maxLength":100}',NULL,'{"visibleWhen":{"field":"transport_mode_id","in":[1,3]}}',1),
  ('import-invoices','transport','trailer_1','Trailer 1','text',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","maxLength":100}',NULL,'{"visibleWhen":{"field":"transport_mode_id","in":[1,3]}}',2),
  ('import-invoices','transport','trailer_2','Trailer 2','text',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","maxLength":100}',NULL,'{"visibleWhen":{"field":"transport_mode_id","in":[1,3]}}',3),
  ('import-invoices','transport','wagon','Wagon','text',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","maxLength":100}',NULL,'{"visibleWhen":{"field":"transport_mode_id","eq":3}}',4),
  ('import-invoices','transport','airway_bill','Airway Bill','text',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","maxLength":100}',NULL,'{"visibleWhen":{"field":"transport_mode_id","eq":2}}',5),
  ('import-invoices','transport','airway_bill_weight','AWB Weight','number',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","min":0,"step":"0.01"}',NULL,'{"visibleWhen":{"field":"transport_mode_id","eq":2}}',6),
  ('import-invoices','transport','container','Container','text',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","maxLength":100}',NULL,'{"visibleWhen":{"field":"transport_mode_id","in":[1,2,3]}}',7),

  -- ── IMPORT · documents ──────────────────────────────────────────────────
  ('import-invoices','documents','facture_pfi_no','Facture/PFI','text',false,NULL,NULL,NULL,'{"colSpan":"5-per-row","maxLength":100}',NULL,NULL,1),
  ('import-invoices','documents','po_ref','PO Ref','text',false,NULL,NULL,NULL,'{"colSpan":"5-per-row","maxLength":100}',NULL,NULL,2),
  ('import-invoices','documents','bivac_inspection','BIVAC','text',false,NULL,NULL,NULL,'{"colSpan":"5-per-row","maxLength":100}',NULL,NULL,3),
  ('import-invoices','documents','produit','Produit','text',false,NULL,NULL,NULL,'{"colSpan":"5-per-row","maxLength":255,"defaultValue":"Default Commodity"}',NULL,NULL,4),
  ('import-invoices','documents','exoneration_code','Exoneration Code','text',false,NULL,NULL,NULL,'{"colSpan":"5-per-row","maxLength":100}',NULL,NULL,5),
  -- Fuel (goods type 3) is billed per M3.
  ('import-invoices','documents','m3','M3','number',false,NULL,NULL,NULL,
    '{"colSpan":"5-per-row","min":0,"step":"0.01"}',NULL,'{"visibleWhen":{"field":"goods_type_id","eq":3}}',6),
  ('import-invoices','documents','declaration_no','Declaration No','text',false,NULL,NULL,NULL,'{"colSpan":"5-per-row","maxLength":100}',NULL,NULL,7),
  ('import-invoices','documents','declaration_date','Declaration Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}',NULL,NULL,8),
  ('import-invoices','documents','liquidation_no','Liquidation No','text',false,NULL,NULL,NULL,'{"colSpan":"5-per-row","maxLength":100}',NULL,NULL,9),
  ('import-invoices','documents','liquidation_date','Liquidation Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}',NULL,NULL,10),
  ('import-invoices','documents','quittance_no','Quittance No','text',false,NULL,NULL,NULL,'{"colSpan":"5-per-row","maxLength":100}',NULL,NULL,11),
  ('import-invoices','documents','quittance_date','Quittance Date','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}',NULL,NULL,12),
  ('import-invoices','documents','dispatch_deliver_date','Dispatch','date',false,NULL,NULL,NULL,'{"colSpan":"5-per-row"}',NULL,NULL,13),

  -- ── IMPORT · comments ───────────────────────────────────────────────────
  ('import-invoices','comments','cmta','Comment A','text',false,NULL,NULL,NULL,
    '{"colSpan":"4-per-row","maxLength":100,"readOnly":true,"placeholder":"AO clients only, sent to DGI if filled"}',NULL,NULL,1),
  ('import-invoices','comments','cmtb','Comment B','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100}',NULL,NULL,2),
  ('import-invoices','comments','cmtc','Comment C','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100}',NULL,NULL,3),
  ('import-invoices','comments','cmtd','Comment D','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100}',NULL,NULL,4),
  ('import-invoices','comments','cmte','Comment E','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100}',NULL,NULL,5),
  ('import-invoices','comments','cmtf','Comment F','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100}',NULL,NULL,6),
  ('import-invoices','comments','cmtg','Comment G','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100}',NULL,NULL,7),
  ('import-invoices','comments','cmth','Comment H','text',false,NULL,NULL,NULL,'{"colSpan":"4-per-row","maxLength":100}',NULL,NULL,8),

  -- ── IMPORT · items ──────────────────────────────────────────────────────
  ('import-invoices','items','invoice_grid','Quotation & MCA Files','invoice-grid',false,NULL,NULL,NULL,
    '{"colSpan":"12","kind":"import"}',NULL,NULL,1);
--> statement-breakpoint

-- Existing fields: moved to their section and brought in line with the spec.
UPDATE "master_page_accordion_field_t" f
SET "accordion_id"        = a."id",
    "label"               = s.label,
    "field_type"          = s.field_type,
    "required"            = s.required,
    "options_source"      = s.options_source,
    "options_label_field" = s.options_label_field,
    "options_static"      = s.options_static,
    "props"               = s.props,
    "derive"              = s.derive,
    "conditions"          = s.conditions,
    "display_order"       = s.ord,
    "display"             = 'Y',
    "updated_at"          = now()
FROM "_invoice_field_spec" s
JOIN "master_page_t" p ON p."slug" = s.page
JOIN "master_page_accordion_t" a ON a."page_id" = p."id" AND a."slug" = s.acc
WHERE f."name" = s.name
  AND f."accordion_id" IN (SELECT x."id" FROM "master_page_accordion_t" x WHERE x."page_id" = p."id");
--> statement-breakpoint

-- New fields.
INSERT INTO "master_page_accordion_field_t"
  ("accordion_id", "name", "label", "field_type", "required", "options_source", "options_label_field",
   "options_static", "props", "derive", "conditions", "display_order", "display")
SELECT a."id", s.name, s.label, s.field_type, s.required, s.options_source, s.options_label_field,
       s.options_static, s.props, s.derive, s.conditions, s.ord, 'Y'
FROM "_invoice_field_spec" s
JOIN "master_page_t" p ON p."slug" = s.page
JOIN "master_page_accordion_t" a ON a."page_id" = p."id" AND a."slug" = s.acc
WHERE NOT EXISTS (
  SELECT 1 FROM "master_page_accordion_field_t" f
  JOIN "master_page_accordion_t" x ON x."id" = f."accordion_id"
  WHERE x."page_id" = p."id" AND f."name" = s.name
);
--> statement-breakpoint

DROP TABLE IF EXISTS "_invoice_field_spec";
--> statement-breakpoint

-- 3. Off the form: the DGI fields (main keeps them out of the invoice form; the
-- e-MCF / list DGI flow owns them). Hidden, not deleted — `display = 'N'` keeps
-- the row for the page builder to restore.
UPDATE "master_page_accordion_field_t" f
SET "display" = 'N', "updated_at" = now()
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
WHERE f."accordion_id" = a."id"
  AND ((p."slug" = 'import-invoices' AND f."name" IN ('tally_ref', 'dgi_amount'))
    OR (p."slug" = 'export-invoices' AND f."name" IN ('dgi_code', 'dgi_amount')));
