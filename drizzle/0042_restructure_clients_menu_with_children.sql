-- Restructures the top-level "Clients" menu (added in 0041 with url='/clients')
-- into a parent group with two children:
--   Clients
--   ├── All Clients   → /clients
--   └── New Client    → /clients/new
--
-- The parent's url is flipped to '#' so the sidebar renders it as a collapsible
-- group rather than a leaf link. The role_menu_mapping_t row for the parent
-- (also added in 0041) is left untouched so Super Admin keeps visibility of the
-- group itself. Children get their own role_menu_mapping_t rows.
--
-- Idempotent: re-running won't duplicate children or role mappings.

DO $$
DECLARE
  parent_id        INT;
  list_child_id    INT;
  new_child_id     INT;
  super_admin_role CONSTANT INT := 1;
BEGIN
  -- 1) Find the existing "Clients" top-level menu.
  SELECT id INTO parent_id
  FROM "menu_master_t"
  WHERE LOWER("menu_name") = 'clients'
    AND "menu_id" IS NULL
  LIMIT 1;

  IF parent_id IS NULL THEN
    RAISE EXCEPTION 'Could not find top-level "Clients" menu. Apply migration 0041 first.';
  END IF;

  -- 2) Flip the parent into a group header. '#' tells the sidebar this is not
  --    a direct link. (toHref() in Sidebar.tsx already treats '#' as inert.)
  UPDATE "menu_master_t"
  SET "url" = '#',
      "updated_by" = 1,
      "updated_at" = now()
  WHERE id = parent_id;

  -- 3a) Insert "All Clients" child (or fetch existing).
  SELECT id INTO list_child_id
  FROM "menu_master_t"
  WHERE "menu_id" = parent_id
    AND LOWER("menu_name") = 'all clients'
  LIMIT 1;

  IF list_child_id IS NULL THEN
    INSERT INTO "menu_master_t"
      ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display", "created_by", "updated_by")
    VALUES
      (parent_id, 1, 1, 'All Clients', '/clients', 'ti ti-list', 'Y', 1, 1)
    RETURNING id INTO list_child_id;
  END IF;

  -- 3b) Insert "New Client" child (or fetch existing).
  SELECT id INTO new_child_id
  FROM "menu_master_t"
  WHERE "menu_id" = parent_id
    AND LOWER("menu_name") = 'new client'
  LIMIT 1;

  IF new_child_id IS NULL THEN
    INSERT INTO "menu_master_t"
      ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display", "created_by", "updated_by")
    VALUES
      (parent_id, 2, 1, 'New Client', '/clients/new', 'ti ti-plus', 'Y', 1, 1)
    RETURNING id INTO new_child_id;
  END IF;

  -- 4) Role mappings for the two new children (Super Admin, full CRUD).
  --    ON CONFLICT against the existing UNIQUE(role_id, menu_id) makes this safe
  --    to re-apply.
  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = super_admin_role) THEN
    INSERT INTO "role_menu_mapping_t"
      ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve", "created_by", "updated_by")
    VALUES
      (super_admin_role, list_child_id, true, true, true, true,  false, 1, 1),
      (super_admin_role, new_child_id,  true, true, true, false, false, 1, 1)
    ON CONFLICT ("role_id", "menu_id") DO NOTHING;
  END IF;
END $$;
