-- Import Tracking: retire eleven fields from the transaction page for every role.
--
-- A field row with display = 'N' is skipped by the page loader, the save route,
-- the record view and the Excel export alike, so this hides them everywhere the
-- page is drawn without touching the columns: values already stored on imports_t
-- are kept, and any field can be brought back from the page builder by setting
-- display = 'Y' again.
UPDATE "master_page_accordion_field_t" f
   SET "display" = 'N',
       "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id"
   AND p."slug" = 'import'
   AND f."name" IN (
     'arrival_date_zambia',
     'dispatch_from_zambia',
     'kanyaka_arrival_date',
     'kanyaka_dispatch_date',
     'segues_rcv_ref',
     'ibs_coupon_reference',
     'customs_clearance_code',
     'customs_manifest_number',
     'audited_date',
     'archived_date',
     'archive_reference'
   );
