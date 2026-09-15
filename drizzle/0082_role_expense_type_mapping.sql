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

-- The screen, under the existing Mapping group.
--
-- The parent is resolved BY NAME, the way 0073 does it, and that is load-bearing
-- twice over. This statement first read `SELECT 176, ...` with no FROM — an
-- unconditional row carrying a hardcoded parent id:
--
--   * On a FRESH database it aborted the whole migration run. Menus are seeded
--     AFTER migrating, so menu_master_t is empty here and menu_id's foreign key
--     rejected the row. Every environment that had not already migrated was
--     blocked, and no later migration could rescue it — a migration that throws
--     stops the ones behind it.
--   * The id itself is not portable. This group is 176 in one database and was
--     edited to 114 for another; a name survives both.
--
-- Selecting FROM the parent makes the statement a no-op when there is no parent
-- yet, which is exactly right: seedMenus owns the sidebar on a fresh install and
-- already carries this row, so the seed creates it moments later. On a database
-- that is already populated, this fills it in without waiting for a reseed.
--
-- Order 4 places it after "Dashboard Cards Mapping" (3) and before "Role Menu
-- Mapping" (12). Guarded on the URL rather than the name+parent pair, so a row
-- already created under a differently-numbered parent is left alone instead of
-- being duplicated.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 4, 1, 'Role Expense Type Mapping', '/mapping/roletoexpensetype', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Mapping' AND p."menu_level" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/mapping/roletoexpensetype'
  );
--> statement-breakpoint

-- §4.7 — permissions are rows in role_menu_mapping_t keyed on the menu, so a
-- new screen with no grant is a 403 for everyone including the Super Admin.
-- Admin (role 1) gets the full grant, matching what seedMenus gives every other
-- seeded row; other roles are granted through /mapping/roletomenu.
-- Matched on the URL for the same reason as above — and this also returns no
-- rows on a fresh database, where the menu does not exist yet and seedMenus
-- issues the grant instead.
INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve")
SELECT 1, m."id", true, true, true, true, true
FROM "menu_master_t" m
WHERE m."url" = '/mapping/roletoexpensetype'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_mapping_t" r WHERE r."role_id" = 1 AND r."menu_id" = m."id"
  );
