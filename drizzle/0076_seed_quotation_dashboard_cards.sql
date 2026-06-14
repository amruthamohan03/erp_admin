-- Quotation dashboard stat cards (category 'quotation_dashboard') + a sidebar menu
-- entry for the quotation page. Same pattern as 0053/0068. Icons are lucide-react
-- names registered in the /quotation page ICONS map.

INSERT INTO "dashboard_card_master_t"
  ("card_key","card_content_id","card_title","card_icon","card_color","card_url","card_order","card_category","data_source","display","created_by","updated_by")
VALUES
  ('quotation.total',      'all',        'Total Quotations', 'FileText',      'primary', '/quotation?card=all',        1, 'quotation_dashboard', '/api/quotations/stats#all',        'Y',1,1),
  ('quotation.import',     'import',     'Import',           'Boxes',         'sky',     '/quotation?card=import',     2, 'quotation_dashboard', '/api/quotations/stats#import',     'Y',1,1),
  ('quotation.export',     'export',     'Export',           'Send',          'emerald', '/quotation?card=export',     3, 'quotation_dashboard', '/api/quotations/stats#export',     'Y',1,1),
  ('quotation.definitive', 'definitive', 'Import Definitive','Layers',        'violet',  '/quotation?card=definitive', 4, 'quotation_dashboard', '/api/quotations/stats#definitive', 'Y',1,1),
  ('quotation.this_month', 'this_month', 'This Month',       'CalendarClock', 'amber',   '/quotation?card=this_month', 5, 'quotation_dashboard', '/api/quotations/stats#this_month', 'Y',1,1)
ON CONFLICT ("card_key") DO UPDATE SET
  "card_content_id" = EXCLUDED."card_content_id",
  "card_title"      = EXCLUDED."card_title",
  "card_icon"       = EXCLUDED."card_icon",
  "card_color"      = EXCLUDED."card_color",
  "card_url"        = EXCLUDED."card_url",
  "card_order"      = EXCLUDED."card_order",
  "card_category"   = EXCLUDED."card_category",
  "data_source"     = EXCLUDED."data_source",
  "updated_by"      = 1,
  "updated_at"      = now();
--> statement-breakpoint

INSERT INTO "role_dashboard_card_mapping_t" ("role_id","card_id","is_visible","card_order","created_by","updated_by")
SELECT r.role_id, c.id, true, c.card_order, 1, 1
FROM "dashboard_card_master_t" c
CROSS JOIN (VALUES (1),(52)) AS r(role_id)
WHERE c.card_category = 'quotation_dashboard'
  AND EXISTS (SELECT 1 FROM "role_master_t" rm WHERE rm.id = r.role_id)
ON CONFLICT ("role_id","card_id") DO NOTHING;
--> statement-breakpoint

-- Sidebar menu entry (under a "Quotation"/"Quotation Management" group if present,
-- else top-level) + Super Admin CRUD.
DO $$
DECLARE
  parent_id    INT;
  next_order   INT;
  new_menu_id  INT;
  child_level  INT;
BEGIN
  SELECT id INTO parent_id FROM "menu_master_t"
   WHERE LOWER("menu_name") IN ('quotation management','quotations','quotation') AND "menu_id" IS NULL
   ORDER BY "menu_order" LIMIT 1;
  child_level := CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END;

  SELECT COALESCE(MAX("menu_order"), 0) + 1 INTO next_order
    FROM "menu_master_t" WHERE "menu_id" IS NOT DISTINCT FROM parent_id;

  SELECT id INTO new_menu_id FROM "menu_master_t"
   WHERE LOWER("menu_name") = 'quotations' AND "menu_id" IS NOT DISTINCT FROM parent_id LIMIT 1;

  IF new_menu_id IS NULL THEN
    INSERT INTO "menu_master_t" ("menu_id","menu_order","menu_level","menu_name","url","display","created_by","updated_by")
    VALUES (parent_id, next_order, child_level, 'Quotations', '/quotation', 'Y', 1, 1)
    RETURNING id INTO new_menu_id;
  END IF;

  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = 1) THEN
    INSERT INTO "role_menu_mapping_t"
      ("role_id","menu_id","can_view","can_add","can_edit","can_delete","can_approve","created_by","updated_by")
    VALUES (1, new_menu_id, true, true, true, true, false, 1, 1)
    ON CONFLICT ("role_id","menu_id") DO NOTHING;
  END IF;
END $$;
