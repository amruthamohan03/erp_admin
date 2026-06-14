-- Quotation category master (item_master_t.category_id references this) + seed of
-- the 4 categories used by the item master, plus a sidebar menu entry. Category
-- names are inferred from how the source groups items (taxes vs bank/seguce vs
-- operations vs agency); they are master data — rename freely in the admin UI.

CREATE TABLE IF NOT EXISTS "quotation_category_master_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "category_name" varchar(150) NOT NULL,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id"),
  "updated_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

INSERT INTO "quotation_category_master_t" ("id","category_name","created_by","updated_by") VALUES
  (1, 'Government Taxes & Duties', 1, 1),
  (2, 'Bank & SEGUCE Charges', 1, 1),
  (3, 'Operations & Clearing Charges', 1, 1),
  (4, 'Agency Fees', 1, 1)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- Keep the serial sequence ahead of the explicitly-seeded ids.
SELECT setval(pg_get_serial_sequence('quotation_category_master_t', 'id'),
              GREATEST((SELECT COALESCE(MAX(id), 1) FROM "quotation_category_master_t"), 1));
--> statement-breakpoint

-- Sidebar menu entry under the "Masters" group (mirrors 0037), + Super Admin CRUD.
DO $$
DECLARE
  parent_id    INT;
  next_order   INT;
  new_menu_id  INT;
  child_level  INT;
BEGIN
  SELECT id INTO parent_id FROM "menu_master_t"
   WHERE LOWER("menu_name") IN ('masters','master','master data') AND "menu_id" IS NULL
   ORDER BY "menu_order" LIMIT 1;
  child_level := CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END;

  SELECT COALESCE(MAX("menu_order"), 0) + 1 INTO next_order
    FROM "menu_master_t" WHERE "menu_id" IS NOT DISTINCT FROM parent_id;

  SELECT id INTO new_menu_id FROM "menu_master_t"
   WHERE LOWER("menu_name") = 'quotation categories' AND "menu_id" IS NOT DISTINCT FROM parent_id LIMIT 1;

  IF new_menu_id IS NULL THEN
    INSERT INTO "menu_master_t" ("menu_id","menu_order","menu_level","menu_name","url","display","created_by","updated_by")
    VALUES (parent_id, next_order, child_level, 'Quotation Categories', '/masters/quotation-categories', 'Y', 1, 1)
    RETURNING id INTO new_menu_id;
  END IF;

  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = 1) THEN
    INSERT INTO "role_menu_mapping_t"
      ("role_id","menu_id","can_view","can_add","can_edit","can_delete","can_approve","created_by","updated_by")
    VALUES (1, new_menu_id, true, true, true, true, false, 1, 1)
    ON CONFLICT ("role_id","menu_id") DO NOTHING;
  END IF;
END $$;
