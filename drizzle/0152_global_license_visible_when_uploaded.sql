-- Import Tracking's "Global License" link (0151) shows only when the picked
-- licence actually has a global licence file. It is filled from the licence by
-- the `fromRelated` derive, so the field appears the moment a licence with a
-- file is picked and stays out of the form for one without — rather than
-- holding a "No file uploaded" placeholder on every import.
UPDATE "master_page_accordion_field_t" f
   SET "conditions" = '{"visibleWhen":{"field":"license_file","truthy":true}}'::jsonb
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id"
   AND p."slug" = 'import'
   AND f."name" = 'license_file'
   AND f."conditions" IS NULL;
