-- Import Tracking → Logistics & Transport: Border Warehouse sits immediately
-- after Entry Coupon (which 0163 placed after DRC Entry Date).
--
-- Matched by page / accordion / field NAME rather than id, so it lands the same
-- on a database whose ids differ. Moves the field in whichever direction is
-- needed and shifts the fields in between by one. A no-op when Border Warehouse
-- already follows Entry Coupon, or when either field is missing on this install.
WITH acc AS (
  SELECT a.id
    FROM master_page_accordion_t a
    JOIN master_page_t p ON p.id = a.page_id
   WHERE p.slug = 'import' AND a.slug = 'logistics-transport'
),
pos AS (
  SELECT (SELECT f.display_order FROM master_page_accordion_field_t f
           WHERE f.accordion_id IN (SELECT id FROM acc) AND f.name = 'entry_coupon') AS coupon,
         (SELECT f.display_order FROM master_page_accordion_field_t f
           WHERE f.accordion_id IN (SELECT id FROM acc) AND f.name = 'border_warehouse_id') AS bw
)
UPDATE master_page_accordion_field_t f
   SET display_order = CASE
         -- Moving up: Border Warehouse takes coupon + 1, the fields between shift down.
         WHEN pos.bw > pos.coupon AND f.name = 'border_warehouse_id' THEN pos.coupon + 1
         WHEN pos.bw > pos.coupon THEN f.display_order + 1
         -- Moving down: the coupon and everything between shift up, Border Warehouse lands after it.
         WHEN f.name = 'border_warehouse_id' THEN pos.coupon
         ELSE f.display_order - 1
       END,
       updated_at = now()
  FROM pos
 WHERE f.accordion_id IN (SELECT id FROM acc)
   AND pos.coupon IS NOT NULL
   AND pos.bw IS NOT NULL
   AND pos.bw <> pos.coupon + 1
   AND (f.name = 'border_warehouse_id'
        OR (pos.bw > pos.coupon AND f.display_order > pos.coupon AND f.display_order < pos.bw)
        OR (pos.bw < pos.coupon AND f.display_order > pos.bw AND f.display_order <= pos.coupon));
