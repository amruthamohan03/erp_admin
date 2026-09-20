-- §2 step 5 — an Import Invoice picks its files in the HEADER, as main did:
-- Client, then License Numbers (many), then the MCA References on those
-- licences (many, with a "Select all").
--
-- The picker is a new VIRTUAL field type, `invoice-files`. It has no column of
-- its own: the selection is `invoice_grid.mcaDetails`, so the page's one Save
-- writes it with the rest of the invoice (§4.17) and the grid keeps the job of
-- filling the header and loading the quotation from the files.

-- 1. The field type. A CHECK cannot be extended in place, so the whole list is
-- restated (§4.5; previous list in 0096).
ALTER TABLE "master_page_accordion_field_t"
  DROP CONSTRAINT IF EXISTS "master_page_accordion_field_t_field_type_check";
--> statement-breakpoint

ALTER TABLE "master_page_accordion_field_t"
  ADD CONSTRAINT "master_page_accordion_field_t_field_type_check"
  CHECK ("field_type" IN (
    'text', 'textarea', 'email', 'tel', 'number', 'date', 'select',
    'checkbox-group', 'file', 'seal-picker', 'remark-log',
    'partielle-picker', 'mca-grid', 'quotation-items', 'invoice-grid',
    'invoice-files'
  ));
--> statement-breakpoint

-- 2. The field, in the header. Two of the row's five cells, because it is two
-- controls; it labels them itself (`hideLabel`). NOT `required` at field level:
-- it has no value of its own to check — the save route refuses an import
-- invoice with no files and names this field.
INSERT INTO "master_page_accordion_field_t"
  ("accordion_id", "name", "label", "field_type", "required", "props", "display_order", "display")
SELECT a."id", 'invoice_files', 'License Numbers / MCA References', 'invoice-files', false,
       '{"colSpan":"2-of-5","hideLabel":true}'::jsonb, 2, 'Y'
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
WHERE p."slug" = 'import-invoices' AND a."slug" = 'header'
  AND NOT EXISTS (
    SELECT 1 FROM "master_page_accordion_field_t" f
    WHERE f."accordion_id" = a."id" AND f."name" = 'invoice_files'
  );
--> statement-breakpoint

-- 3. main's header order: Client | Licences + MCAs | Invoice Ref | Mode de
-- paiement, then ARSP | Kind | Type of Goods | Transport Mode | Template.
UPDATE "master_page_accordion_field_t" f
SET "display_order" = v.ord
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id",
  (VALUES ('client_id', 1), ('invoice_files', 2), ('invoice_ref', 3),
          ('payment_method', 4), ('arsp', 5), ('kind_id', 6),
          ('goods_type_id', 7), ('transport_mode_id', 8),
          ('invoice_template', 9)) AS v(name, ord)
WHERE p."slug" = 'import-invoices' AND a."slug" = 'header'
  AND f."accordion_id" = a."id" AND f."name" = v.name;
