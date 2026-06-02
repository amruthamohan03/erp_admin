-- Adds sidebar menu entries for the new `phases` and `referers` master pages
-- and grants Super Admin (role_id = 1) full CRUD on them.
--
-- The migration:
--   1. Looks for a likely "Masters" parent menu group (case-insensitive match on
--      'masters' / 'master' / 'master data', and no parent itself). If found, the
--      new entries nest under it. If not, they're inserted as top-level menus and
--      can be re-parented later via the menu admin UI.
--   2. Computes the next menu_order under that parent so the new entries land at
--      the bottom of the existing list, not on top of any current ordering.
--   3. Inserts Phases and Referrers if not already present (idempotent — re-running
--      the migration won't create duplicates).
--   4. Grants role_id = 1 (Super Admin) view/add/edit/delete on both menus. Uses
--      ON CONFLICT against role_menu_mapping_t's UNIQUE(role_id, menu_id) so
--      re-running is safe. Other roles can be granted access via /mapping/roletomenu.

DO $$
DECLARE
  parent_id        INT;
  next_order       INT;
  phases_menu_id   INT;
  referers_menu_id INT;
  super_admin_role CONSTANT INT := 1;
  child_level      INT;
BEGIN
  -- 1) Find a "Masters" parent group at the top level. NULL if none match.
  SELECT id INTO parent_id
  FROM "menu_master_t"
  WHERE LOWER("menu_name") IN ('masters', 'master', 'master data')
    AND "menu_id" IS NULL
  ORDER BY "menu_order"
  LIMIT 1;

  child_level := CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END;

  -- 2) Compute next menu_order under whichever parent we landed on (or top-level).
  --    `IS NOT DISTINCT FROM` treats two NULLs as equal — that lets the same
  --    expression handle both nested and top-level cases.
  SELECT COALESCE(MAX("menu_order"), 0) + 1
  INTO next_order
  FROM "menu_master_t"
  WHERE "menu_id" IS NOT DISTINCT FROM parent_id;

  -- 3a) Insert Phases (or fetch the existing row if already present).
  SELECT id INTO phases_menu_id
  FROM "menu_master_t"
  WHERE LOWER("menu_name") = 'phases'
    AND "menu_id" IS NOT DISTINCT FROM parent_id
  LIMIT 1;

  IF phases_menu_id IS NULL THEN
    INSERT INTO "menu_master_t"
      ("menu_id", "menu_order", "menu_level", "menu_name", "url", "display", "created_by", "updated_by")
    VALUES
      (parent_id, next_order, child_level, 'Phases', '/masters/phases', 'Y', 1, 1)
    RETURNING id INTO phases_menu_id;
    next_order := next_order + 1;
  END IF;

  -- 3b) Insert Referrers (or fetch existing).
  SELECT id INTO referers_menu_id
  FROM "menu_master_t"
  WHERE LOWER("menu_name") = 'referrers'
    AND "menu_id" IS NOT DISTINCT FROM parent_id
  LIMIT 1;

  IF referers_menu_id IS NULL THEN
    INSERT INTO "menu_master_t"
      ("menu_id", "menu_order", "menu_level", "menu_name", "url", "display", "created_by", "updated_by")
    VALUES
      (parent_id, next_order, child_level, 'Referrers', '/masters/referers', 'Y', 1, 1)
    RETURNING id INTO referers_menu_id;
  END IF;

  -- 4) Grant Super Admin full CRUD on both. Skip if role 1 doesn't exist
  --    (defensive — should always exist, but FK would fail otherwise).
  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = super_admin_role) THEN
    INSERT INTO "role_menu_mapping_t"
      ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve", "created_by", "updated_by")
    VALUES
      (super_admin_role, phases_menu_id,   true, true, true, true, false, 1, 1),
      (super_admin_role, referers_menu_id, true, true, true, true, false, 1, 1)
    ON CONFLICT ("role_id", "menu_id") DO NOTHING;
  END IF;
END $$;
