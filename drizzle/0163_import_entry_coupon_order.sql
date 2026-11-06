-- Import Tracking → Logistics & Transport: Entry Coupon sits immediately after
-- DRC Entry Date — the coupon is issued at the DRC entry point, so operators
-- fill the two together.
--
-- Matched by page / accordion / field NAME rather than id, so it lands the same
-- on a database whose ids differ. The fields between the two move down by one
-- to make room. A no-op when Entry Coupon already follows DRC Entry Date, or
-- when either field is missing on this install.
WITH acc AS (
  SELECT a.id
    FROM master_page_accordion_t a
    JOIN master_page_t p ON p.id = a.page_id
   WHERE p.slug = 'import' AND a.slug = 'logistics-transport'
),
pos AS (
  SELECT (SELECT f.display_order FROM master_page_accordion_field_t f
           WHERE f.accordion_id IN (SELECT id FROM acc) AND f.name = 'drc_entry_date') AS drc,
         (SELECT f.display_order FROM master_page_accordion_field_t f
           WHERE f.accordion_id IN (SELECT id FROM acc) AND f.name = 'entry_coupon') AS coupon
)
UPDATE master_page_accordion_field_t f
   SET display_order = CASE
         WHEN f.name = 'entry_coupon' THEN pos.drc + 1
         ELSE f.display_order + 1
       END,
       updated_at = now()
  FROM pos
 WHERE f.accordion_id IN (SELECT id FROM acc)
   AND pos.drc IS NOT NULL
   AND pos.coupon IS NOT NULL
   AND pos.coupon > pos.drc + 1
   AND (f.name = 'entry_coupon'
        OR (f.display_order > pos.drc AND f.display_order < pos.coupon));
