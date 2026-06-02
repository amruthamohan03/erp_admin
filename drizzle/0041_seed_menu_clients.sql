-- Adds a top-level "Clients" sidebar menu pointing at /clients (the §4.12
-- transactional page) and grants Super Admin full access to it.
-- Same pattern as 0037 — idempotent via existence checks + ON CONFLICT.

DO $$
DECLARE
  clients_menu_id  INT;
  next_order       INT;
  super_admin_role CONSTANT INT := 1;
BEGIN
  -- Compute next top-level menu_order so we don't collide with existing items.
  SELECT COALESCE(MAX("menu_order"), 0) + 1
  INTO next_order
  FROM "menu_master_t"
  WHERE "menu_id" IS NULL;

  -- Insert Clients menu (or fetch existing).
  SELECT id INTO clients_menu_id
  FROM "menu_master_t"
  WHERE LOWER("menu_name") = 'clients'
    AND "menu_id" IS NULL
  LIMIT 1;

  IF clients_menu_id IS NULL THEN
    INSERT INTO "menu_master_t"
      ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display", "created_by", "updated_by")
    VALUES
      (NULL, next_order, 0, 'Clients', '/clients', 'ti ti-users', 'Y', 1, 1)
    RETURNING id INTO clients_menu_id;
  END IF;

  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = super_admin_role) THEN
    INSERT INTO "role_menu_mapping_t"
      ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve", "created_by", "updated_by")
    VALUES
      (super_admin_role, clients_menu_id, true, true, true, true, false, 1, 1)
    ON CONFLICT ("role_id", "menu_id") DO NOTHING;
  END IF;
END $$;
