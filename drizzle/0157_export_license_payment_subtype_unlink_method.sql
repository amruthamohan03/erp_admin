-- 0144 made Payment Subtype a flat list, independent of Payment Method, but only
-- on the import licence page (slug 'license'). The export licence kept
-- `optionsParams: { payment_type_id: payment_method_id }`, which filters the
-- subtypes by a Payment METHOD id read as a Payment TYPE id — two unrelated
-- masters — so the list came back wrong or empty depending on the method picked.
UPDATE "master_page_accordion_field_t" f
   SET "props" = f."props" - 'optionsParams',
       "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id"
   AND p."slug" = 'export-license' AND f."name" = 'payment_subtype_id'
   AND f."props" ? 'optionsParams';
