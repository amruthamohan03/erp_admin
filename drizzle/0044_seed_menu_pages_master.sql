-- Adds a sidebar menu entry for the §4.12 transactional-page admin at
-- /masters/pages, nested under the existing "Masters" group if one exists.
-- Super Admin gets full CRUD. Same idempotent pattern as 0037 + 0041.

DO $$
DECLARE
  parent_id        INT;
  pages_menu_id    INT;
  next_order       INT;
  super_admin_role CONSTANT INT := 1;
  child_level      INT;
BEGIN
  -- Find a "Masters" group at the top level (case-insensitive). NULL if none.
  SELECT id INTO parent_id
  FROM "menu_master_t"
  WHERE LOWER("menu_name") IN ('masters', 'master', 'master data')
    AND "menu_id" IS NULL
  ORDER BY "menu_order"
  LIMIT 1;

  child_level := CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END;

  -- Compute next menu_order under parent (or top-level if parent missing).
  SELECT COALESCE(MAX("menu_order"), 0) + 1
  INTO next_order
  FROM "menu_master_t"
  WHERE "menu_id" IS NOT DISTINCT FROM parent_id;

  -- Insert "Pages" (or fetch existing).
  SELECT id INTO pages_menu_id
  FROM "menu_master_t"
  WHERE LOWER("menu_name") = 'pages'
    AND "menu_id" IS NOT DISTINCT FROM parent_id
  LIMIT 1;

  IF pages_menu_id IS NULL THEN
    INSERT INTO "menu_master_t"
      ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display", "created_by", "updated_by")
    VALUES
      (parent_id, next_order, child_level, 'Pages', '/masters/pages', 'ti ti-layout-grid', 'Y', 1, 1)
    RETURNING id INTO pages_menu_id;
  END IF;

  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = super_admin_role) THEN
    INSERT INTO "role_menu_mapping_t"
      ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve", "created_by", "updated_by")
    VALUES
      (super_admin_role, pages_menu_id, true, true, true, true, false, 1, 1)
    ON CONFLICT ("role_id", "menu_id") DO NOTHING;
  END IF;
END $$;
