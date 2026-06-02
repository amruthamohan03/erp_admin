-- Restructures the "Pages" menu added in 0044 (single link at /masters/pages)
-- into a parent group with four children that deep-link into the corresponding
-- tab of the master_page_t tabbed editor. The list page reads ?tab= and forwards
-- it into each row's edit link, so clicking "Accordions" → row's Configure
-- button lands the user on the Accordions tab of the chosen page.
--
--   Transactional Pages   (group, url='#')
--   ├── All Pages         → /masters/pages
--   ├── Accordions        → /masters/pages?tab=accordions
--   ├── Fields            → /masters/pages?tab=fields
--   └── Role Grants       → /masters/pages?tab=roles
--
-- Idempotent — re-running won't duplicate children or role mappings.

DO $$
DECLARE
  parent_id        INT;
  all_pages_id    INT;
  accordions_id    INT;
  fields_id        INT;
  roles_id         INT;
  super_admin_role CONSTANT INT := 1;
BEGIN
  -- 1) Find the existing "Pages" menu (created in 0044, nested under Masters).
  SELECT id INTO parent_id
  FROM "menu_master_t"
  WHERE LOWER("menu_name") = 'pages'
  ORDER BY "menu_order"
  LIMIT 1;

  IF parent_id IS NULL THEN
    RAISE EXCEPTION 'Could not find "Pages" menu. Apply migration 0044 first.';
  END IF;

  -- 2) Rename + flip to parent group. '#' tells the sidebar this is not a link.
  UPDATE "menu_master_t"
  SET "menu_name" = 'Transactional Pages',
      "url" = '#',
      "updated_by" = 1,
      "updated_at" = now()
  WHERE id = parent_id;

  -- 3) Insert the 4 children (or fetch existing) ----------------------------
  SELECT id INTO all_pages_id FROM "menu_master_t"
   WHERE "menu_id" = parent_id AND LOWER("menu_name") = 'all pages' LIMIT 1;
  IF all_pages_id IS NULL THEN
    INSERT INTO "menu_master_t"
      ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display", "created_by", "updated_by")
    VALUES
      (parent_id, 1, 1, 'All Pages', '/masters/pages', 'ti ti-layout-grid', 'Y', 1, 1)
    RETURNING id INTO all_pages_id;
  END IF;

  SELECT id INTO accordions_id FROM "menu_master_t"
   WHERE "menu_id" = parent_id AND LOWER("menu_name") = 'accordions' LIMIT 1;
  IF accordions_id IS NULL THEN
    INSERT INTO "menu_master_t"
      ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display", "created_by", "updated_by")
    VALUES
      (parent_id, 2, 1, 'Accordions', '/masters/pages?tab=accordions', 'ti ti-layout-rows', 'Y', 1, 1)
    RETURNING id INTO accordions_id;
  END IF;

  SELECT id INTO fields_id FROM "menu_master_t"
   WHERE "menu_id" = parent_id AND LOWER("menu_name") = 'fields' LIMIT 1;
  IF fields_id IS NULL THEN
    INSERT INTO "menu_master_t"
      ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display", "created_by", "updated_by")
    VALUES
      (parent_id, 3, 1, 'Fields', '/masters/pages?tab=fields', 'ti ti-forms', 'Y', 1, 1)
    RETURNING id INTO fields_id;
  END IF;

  SELECT id INTO roles_id FROM "menu_master_t"
   WHERE "menu_id" = parent_id AND LOWER("menu_name") = 'role grants' LIMIT 1;
  IF roles_id IS NULL THEN
    INSERT INTO "menu_master_t"
      ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display", "created_by", "updated_by")
    VALUES
      (parent_id, 4, 1, 'Role Grants', '/masters/pages?tab=roles', 'ti ti-shield-lock', 'Y', 1, 1)
    RETURNING id INTO roles_id;
  END IF;

  -- 4) Role mappings for the children. Parent's role mapping from 0044 is left
  --    untouched so Super Admin keeps visibility of the group.
  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = super_admin_role) THEN
    INSERT INTO "role_menu_mapping_t"
      ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve", "created_by", "updated_by")
    VALUES
      (super_admin_role, all_pages_id, true, true, true, true,  false, 1, 1),
      (super_admin_role, accordions_id, true, true, true, true,  false, 1, 1),
      (super_admin_role, fields_id,     true, true, true, true,  false, 1, 1),
      (super_admin_role, roles_id,      true, true, true, false, false, 1, 1)
    ON CONFLICT ("role_id", "menu_id") DO NOTHING;
  END IF;
END $$;
