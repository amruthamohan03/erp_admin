-- Import Tracking: retire SEGUCE Payment Date and Customs Manifest Date from the
-- transaction page for every role. Same shape as 0155 — display = 'N' hides the
-- field from the page, the save route, the record view and the export, while
-- the stored values on imports_t are kept and the page builder can bring either
-- field back.
UPDATE "master_page_accordion_field_t" f
   SET "display" = 'N',
       "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id"
   AND p."slug" = 'import'
   AND f."name" IN ('segues_payment_date', 'customs_manifest_date');
