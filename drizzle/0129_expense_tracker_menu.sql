-- Expense Tracker — per-file spend, revenue and profit (§4.29).
--
-- Nothing here creates a table: every figure is an aggregate over rows that
-- already exist. Spend comes from `payment_request_t.mca_data`, which already
-- carries a per-file split; revenue is each file's share of the invoices
-- covering it. The screen is the module.
--
-- Parent resolved BY NAME (the 0089 pattern): on a fresh database menus are
-- seeded after migrations run, so this is a silent no-op there and seedMenus
-- carries the same row.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 3, 1, 'Expense Tracker', '/expense-tracker', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Advance Payment' AND p."menu_level" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/expense-tracker'
  );
--> statement-breakpoint

-- §4.7 — the menu URL IS the permission resource, so a new screen with no
-- mapping row is denied to everyone, Super Admin included.
--
-- Granted to every role that can already VIEW payment requests: this reports on
-- the money those requests moved, so anyone who may read them may read this.
-- Read-only — it creates and changes nothing — and export follows the role's
-- own export right rather than being granted outright, because a spreadsheet of
-- every file's margin leaves the building.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", d."id",
       true,
       false, false, false, false,
       false, false,
       r."can_export", false, r."can_print",
       false, false, false
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" src ON src."id" = r."menu_id" AND src."url" = '/payments'
  JOIN "menu_master_t" d ON d."url" = '/expense-tracker'
 WHERE r."can_view" = true
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
