-- §4.1 — Role → Expense Type mapping.
--
-- Which expense types a role may file a Payment Request against. The expense
-- type decides which MCA references are claimable (a reference maps ONE-TO-ONE
-- to an expense type), so "who may spend against what" is a business decision
-- an administrator makes in the browser rather than a list in a handler.
--
-- A role with NO rows is unrestricted — restriction is opt-in, per role, so an
-- empty table on the day this ships locks nobody out of the picker.

CREATE TABLE IF NOT EXISTS "role_expense_type_mapping_t" (
  "id"              serial PRIMARY KEY,
  "role_id"         integer NOT NULL REFERENCES "role_master_t"("id") ON DELETE CASCADE,
  "expense_type_id" integer NOT NULL REFERENCES "expense_type_master_t"("id") ON DELETE CASCADE,
  "is_allowed"      boolean NOT NULL DEFAULT true,
  "created_by"      integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by"      integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at"      timestamp NOT NULL DEFAULT now(),
  "updated_at"      timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- One decision per (role, expense type). The PUT upserts on this target.
CREATE UNIQUE INDEX IF NOT EXISTS "role_expense_type_mapping_role_type_uq"
  ON "role_expense_type_mapping_t" ("role_id", "expense_type_id");
--> statement-breakpoint

-- Read path: "what may this role spend against" is the question every lookup
-- asks, so the role leads.
CREATE INDEX IF NOT EXISTS "role_expense_type_mapping_role_idx"
  ON "role_expense_type_mapping_t" ("role_id");
--> statement-breakpoint

-- The screen, under the existing Mapping group (menu_master_t id 176).
-- Keyed by (menu_name, menu_id) to match seedMenus' natural key, so a fresh
-- database that migrates and then seeds ends in one row, not two. Order 4
-- places it after "Dashboard Cards Mapping" (3) and before "Role Menu
-- Mapping" (12). The id is left to the sequence: menus.ts seeds by name, not
-- by id, so there is no id to collide with.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT 114, 4, 1, 'Role Expense Type Mapping', '/mapping/roletoexpensetype', '', 'Y'
WHERE NOT EXISTS (
  SELECT 1 FROM "menu_master_t" WHERE "menu_name" = 'Role Expense Type Mapping' AND "menu_id" = 114
);
--> statement-breakpoint

-- §4.7 — permissions are rows in role_menu_mapping_t keyed on the menu, so a
-- new screen with no grant is a 403 for everyone including the Super Admin.
-- Admin (role 1) gets the full grant, matching what seedMenus gives every other
-- seeded row; other roles are granted through /mapping/roletomenu.
INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve")
SELECT 1, m."id", true, true, true, true, true
FROM "menu_master_t" m
WHERE m."menu_name" = 'Role Expense Type Mapping' AND m."menu_id" = 114
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_mapping_t" r WHERE r."role_id" = 1 AND r."menu_id" = m."id"
  );
