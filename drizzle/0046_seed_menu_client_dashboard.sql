-- Adds the "Client Dashboard" link as a child of the existing "Clients" sidebar
-- group (the group was set up in 0042). Same idempotent pattern as 0044 / 0045.
--
--   Clients   (group, url='#')
--   ├── All Clients      → /clients          (existing, from 0042)
--   ├── New Client       → /clients/new      (existing, from 0042)
--   └── Client Dashboard → /clients/dashboard (new, this migration)

DO $$
DECLARE
  parent_id        INT;
  dashboard_id     INT;
  next_order       INT;
  super_admin_role CONSTANT INT := 1;
BEGIN
  -- 1) Locate the existing "Clients" group from migration 0042 (url = '#').
  SELECT id INTO parent_id
  FROM "menu_master_t"
  WHERE LOWER("menu_name") = 'clients'
    AND "menu_id" IS NULL
    AND "url" = '#'
  LIMIT 1;

  IF parent_id IS NULL THEN
    RAISE EXCEPTION 'Could not find "Clients" parent group. Apply migration 0042 first.';
  END IF;

  -- 2) Next display order under the parent.
  SELECT COALESCE(MAX("menu_order"), 0) + 1
  INTO next_order
  FROM "menu_master_t"
  WHERE "menu_id" = parent_id;

  -- 3) Insert "Client Dashboard" (or fetch existing).
  SELECT id INTO dashboard_id
  FROM "menu_master_t"
  WHERE "menu_id" = parent_id
    AND LOWER("menu_name") = 'client dashboard'
  LIMIT 1;

  IF dashboard_id IS NULL THEN
    INSERT INTO "menu_master_t"
      ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display", "created_by", "updated_by")
    VALUES
      (parent_id, next_order, 1, 'Client Dashboard', '/clients/dashboard', 'ti ti-chart-pie', 'Y', 1, 1)
    RETURNING id INTO dashboard_id;
  END IF;

  -- 4) Super Admin gets view-only by default (dashboards aren't write surfaces).
  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = super_admin_role) THEN
    INSERT INTO "role_menu_mapping_t"
      ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve", "created_by", "updated_by")
    VALUES
      (super_admin_role, dashboard_id, true, false, false, false, false, 1, 1)
    ON CONFLICT ("role_id", "menu_id") DO NOTHING;
  END IF;
END $$;
