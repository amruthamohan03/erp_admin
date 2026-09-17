-- §2 step 5 / §4.17 — the Import Invoice's line items move INTO the transaction
-- page.
--
-- The grid rendered below /import-invoices/{id} as a second component with its
-- own Save button and its own endpoint. §4.17 is explicit that a transaction
-- page has exactly one Save, and the three failures that rule exists to prevent
-- were all live here:
--
--   * two controls wrote the same invoice, so saving one silently discarded the
--     other's edits;
--   * the header's stored totals and its stored lines could disagree between
--     the two clicks, because each was a separate transaction;
--   * /import-invoices/new had NO grid, so an invoice could not be created with
--     its items in one go — the operator had to save a bare header first, then
--     come back to it.
--
-- The same defect was removed from Payment Request when its second references
-- grid was folded into the form; this is that fix applied to invoices.

-- 1. The field type.
--
-- A CHECK cannot be extended in place, so the whole list is restated — the shape
-- migrations 0048, 0059 and 0095 used for the earlier grid types (§4.5).
ALTER TABLE "master_page_accordion_field_t"
  DROP CONSTRAINT IF EXISTS "master_page_accordion_field_t_field_type_check";
--> statement-breakpoint

ALTER TABLE "master_page_accordion_field_t"
  ADD CONSTRAINT "master_page_accordion_field_t_field_type_check"
  CHECK ("field_type" IN (
    'text', 'textarea', 'email', 'tel', 'number', 'date', 'select',
    'checkbox-group', 'file', 'seal-picker', 'remark-log',
    'partielle-picker', 'mca-grid', 'quotation-items', 'invoice-grid'
  ));
--> statement-breakpoint

-- 2. The accordion that holds it, after the header and financial sections.
INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "display_order", "display")
SELECT p."id", 'items', 'MCA References & Items', 'ti ti-list-details', 3, 'Y'
FROM "master_page_t" p
WHERE p."slug" = 'import-invoices'
  AND NOT EXISTS (
    SELECT 1 FROM "master_page_accordion_t" a
    WHERE a."page_id" = p."id" AND a."slug" = 'items'
  );
--> statement-breakpoint

-- 3. The field.
--
-- `invoice_grid` is VIRTUAL — `import_invoices_t` has no such column, because
-- the rows live in `import_invoice_items_t` and the MCA selection is a CSV the
-- grid derives. The runtime's column whitelist therefore drops it from the
-- patch, and the save route's invoice hook carries it instead, writing the
-- children in the same transaction as the header whose totals they produce.
--
-- `kind` in props rather than inferred from the route: which side of the
-- business an invoice belongs to is configuration (§4.1), and the same field
-- type serves the export invoice page when that one is wired up too.
--
-- NOT required: an invoice header is legitimately saved before its lines are
-- known, which is the workflow the old two-Save layout forced and this one
-- merely permits.
INSERT INTO "master_page_accordion_field_t"
  ("accordion_id", "name", "label", "field_type", "required", "props", "display_order", "display")
SELECT a."id", 'invoice_grid', 'MCA References & Items', 'invoice-grid', false,
       '{"colSpan":"12","kind":"import"}'::jsonb, 1, 'Y'
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
WHERE p."slug" = 'import-invoices' AND a."slug" = 'items'
  AND NOT EXISTS (
    SELECT 1 FROM "master_page_accordion_field_t" f
    WHERE f."accordion_id" = a."id" AND f."name" = 'invoice_grid'
  );
--> statement-breakpoint

-- 4. §4.7 — an accordion with no grant is invisible to every role including the
-- Super Admin, so the section would render empty. Admin gets edit, matching the
-- page's other two accordions; other roles are granted through the page builder.
INSERT INTO "master_page_accordion_role_t" ("accordion_id", "role_id", "permission")
SELECT a."id", r."role_id", r."permission"
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
CROSS JOIN (
  -- Mirror whatever the header accordion already grants, so the new section is
  -- visible to exactly the roles that can already edit this invoice rather than
  -- to a hardcoded list.
  SELECT DISTINCT r2."role_id", r2."permission"
  FROM "master_page_accordion_role_t" r2
  JOIN "master_page_accordion_t" a2 ON a2."id" = r2."accordion_id"
  JOIN "master_page_t" p2 ON p2."id" = a2."page_id"
  WHERE p2."slug" = 'import-invoices' AND a2."slug" = 'header'
) r
WHERE p."slug" = 'import-invoices' AND a."slug" = 'items'
  AND NOT EXISTS (
    SELECT 1 FROM "master_page_accordion_role_t" x
    WHERE x."accordion_id" = a."id" AND x."role_id" = r."role_id"
  );
