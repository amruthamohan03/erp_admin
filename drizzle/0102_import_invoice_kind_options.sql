-- §2 step 5 — the import invoice's Kind must be able to SHOW every kind a file
-- can carry.
--
-- Kind is read-only on the invoice: it is filled from the selected MCA files'
-- licence, never picked. Its options were the `use_for_import` kinds only (1, 2),
-- but main's import invoice accepts files of kinds 1, 2, 5 and 6 (UNDER VALUE,
-- HAND CARRY). A file of kind 5 or 6 therefore set a value the dropdown did not
-- contain, and Kind rendered blank. Filtering a display-only list protects
-- nothing, so it lists every active kind.

UPDATE "master_page_accordion_field_t" f
SET "options_source" = 'kinds', "updated_at" = now()
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
WHERE f."accordion_id" = a."id"
  AND p."slug" = 'import-invoices'
  AND f."name" = 'kind_id';
