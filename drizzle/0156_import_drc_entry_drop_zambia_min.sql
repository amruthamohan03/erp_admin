-- 0155 hid Dispatch From Zambia. DRC Entry Date kept a `min` bound on it, so an
-- import that already stores a dispatch date would still refuse an earlier
-- entry date, citing a field the operator can no longer see or correct. Drop
-- the bound; the field's visibleWhen on transport mode is untouched.
UPDATE "master_page_accordion_field_t" f
   SET "conditions" = f."conditions" - 'min',
       "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id"
   AND p."slug" = 'import'
   AND f."name" = 'drc_entry_date'
   AND f."conditions" -> 'min' = '{"field":"dispatch_from_zambia"}'::jsonb;
