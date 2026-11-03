-- Replaces 0152's approach. A visibleWhen on the field's OWN value could never
-- be cleared: the form and the save route both skip a hidden field, so moving
-- an import from a licence that has a global licence file to one that has none
-- left the previous licence's link stored on the import.
--
-- `props.hideWhenEmpty` hides the field from layout only (Accordion and the
-- record view) while it is empty; it stays in the save, so the cleared value
-- is written.
UPDATE "master_page_accordion_field_t" f
   SET "conditions" = NULL,
       "props" = COALESCE(f."props", '{}'::jsonb) || '{"hideWhenEmpty":true}'::jsonb
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id"
   AND p."slug" = 'import'
   AND f."name" = 'license_file'
   AND (f."conditions" IS NULL
        OR f."conditions" = '{"visibleWhen":{"field":"license_file","truthy":true}}'::jsonb);
