-- §2 step 2 / §4.12 — the Quotation as a TRANSACTION PAGE.
--
-- Quotations were the last case type still served by a single hand-built screen
-- carrying its own create/edit form above its own list. §4.3 is explicit that a
-- new case type is a configuration row and not a module folder, and everything
-- that follows from that was missing here: no field-level role grants, no
-- conditions runtime, no audit trail per accordion, and a form that could not be
-- changed without a deploy.
--
-- This registers the page so /quotations/new and /quotations/{id} run on the
-- same runtime as Import, Export, Local and Payment Request.

-- 1. The new field type for the line-items grid.
--
-- A CHECK cannot be extended in place, so the whole list is restated — the same
-- shape migrations 0048 and 0059 used when `remark-log` and `mca-grid` were
-- added (§4.5).
ALTER TABLE "master_page_accordion_field_t"
  DROP CONSTRAINT IF EXISTS "master_page_accordion_field_t_field_type_check";
--> statement-breakpoint

ALTER TABLE "master_page_accordion_field_t"
  ADD CONSTRAINT "master_page_accordion_field_t_field_type_check"
  CHECK ("field_type" IN (
    'text', 'textarea', 'email', 'tel', 'number', 'date', 'select',
    'checkbox-group', 'file', 'seal-picker', 'remark-log',
    'partielle-picker', 'mca-grid', 'quotation-items'
  ));
--> statement-breakpoint

-- 2. The page.
--
-- Guarded on the slug so re-running is a no-op, and so a database where someone
-- has already created it by hand is left alone rather than duplicated.
INSERT INTO "master_page_t" ("slug", "title", "route", "target_table", "display_order", "display")
SELECT 'quotation', 'Quotation', '/quotations', 'quotations_t', 10, 'Y'
WHERE NOT EXISTS (SELECT 1 FROM "master_page_t" WHERE "slug" = 'quotation');
--> statement-breakpoint

-- 3. Two accordions.
--
-- The split is along what an operator is DOING, not along the table: the header
-- identifies and prices the quotation (client, kind, transport, goods), and the
-- items are the quotation itself. Both open expanded (§4.34) and both are saved
-- by the page's single Save (§4.17).
INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "display_order", "display")
SELECT p."id", v.slug, v.title, v.icon, v.ord, 'Y'
FROM "master_page_t" p
CROSS JOIN (VALUES
  ('basic', 'Quotation Details', 'ti ti-file-invoice', 1),
  ('items', 'Quotation Items',   'ti ti-list-details', 2)
) AS v(slug, title, icon, ord)
WHERE p."slug" = 'quotation'
  AND NOT EXISTS (
    SELECT 1 FROM "master_page_accordion_t" a
    WHERE a."page_id" = p."id" AND a."slug" = v.slug
  );
--> statement-breakpoint

-- 4. Header fields.
--
-- `quotation_ref` is read-only and derived from the four dropdowns below it
-- (client-kind-transport-goods), so it carries the required star without the
-- attribute — the constraint API exempts a derived field, which is the case
-- §4.18 calls out explicitly.
--
-- colSpan 4-per-row keeps the seven header fields on two tidy rows.
INSERT INTO "master_page_accordion_field_t"
  ("accordion_id", "name", "label", "field_type", "required",
   "options_source", "options_label_field", "options_static", "props", "display_order", "display")
SELECT a."id", v.name, v.label, v.field_type, v.required,
       v.options_source, v.options_label_field, v.options_static::jsonb, v.props::jsonb, v.ord, 'Y'
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
CROSS JOIN (VALUES
  ('client_id', 'Client', 'select', true,
   'clients', 'short_name', NULL, '{"colSpan":"4-per-row"}', 1),
  ('quotation_ref', 'Quotation Ref', 'text', true,
   NULL, NULL, NULL, '{"colSpan":"4-per-row","readOnly":true,"maxLength":255,"placeholder":"Built from the four pickers"}', 2),
  ('quotation_date', 'Date', 'date', true,
   NULL, NULL, NULL, '{"colSpan":"4-per-row"}', 3),
  ('kind_id', 'Kind', 'select', true,
   'kinds', 'kind_name', NULL, '{"colSpan":"4-per-row"}', 4),
  ('transport_mode_id', 'Transport', 'select', true,
   'transport-modes', 'transport_mode_name', NULL, '{"colSpan":"4-per-row"}', 5),
  ('goods_type_id', 'Type of Goods', 'select', true,
   'goods-types', 'goods_type', NULL, '{"colSpan":"4-per-row"}', 6),
  ('arsp', 'ARSP', 'select', true,
   NULL, NULL, '[{"value":"Enabled","label":"Enabled"},{"value":"Disabled","label":"Disabled"}]',
   '{"colSpan":"4-per-row","defaultValue":"Disabled"}', 7)
) AS v(name, label, field_type, required, options_source, options_label_field, options_static, props, ord)
WHERE p."slug" = 'quotation' AND a."slug" = 'basic'
  AND NOT EXISTS (
    SELECT 1 FROM "master_page_accordion_field_t" f
    WHERE f."accordion_id" = a."id" AND f."name" = v.name
  );
--> statement-breakpoint

-- 5. The items grid.
--
-- `items` is a VIRTUAL field — `quotations_t` has no such column, because the
-- lines live in the `quotation_items_t` child table (see quotationPage.ts for
-- why that is right here and why §4.5's JSONB default does not apply). The
-- runtime's column whitelist therefore drops it from the patch, and the page
-- hook in the save route carries it instead.
--
-- Required: a quotation with no lines has no price, so it is not a quotation.
INSERT INTO "master_page_accordion_field_t"
  ("accordion_id", "name", "label", "field_type", "required", "props", "display_order", "display")
SELECT a."id", 'items', 'Items', 'quotation-items', true, '{"colSpan":"12"}'::jsonb, 1, 'Y'
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
WHERE p."slug" = 'quotation' AND a."slug" = 'items'
  AND NOT EXISTS (
    SELECT 1 FROM "master_page_accordion_field_t" f
    WHERE f."accordion_id" = a."id" AND f."name" = 'items'
  );
--> statement-breakpoint

-- 6. §4.7 — an accordion with no grant is invisible to every role including the
-- Super Admin, so the page would render empty. Admin (role 1) gets edit on both,
-- matching every other transaction page; other roles are granted through the
-- page-builder screen.
INSERT INTO "master_page_accordion_role_t" ("accordion_id", "role_id", "permission")
SELECT a."id", 1, 'edit'
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
WHERE p."slug" = 'quotation'
  AND NOT EXISTS (
    SELECT 1 FROM "master_page_accordion_role_t" r
    WHERE r."accordion_id" = a."id" AND r."role_id" = 1
  );
