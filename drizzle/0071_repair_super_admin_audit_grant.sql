-- 0071 — repair the Super Admin grant on the Audit Log menu.
--
-- 0055 created the menu and granted role 1, but only `WHERE NOT EXISTS` a
-- mapping row. On any database where role 1 already HAD a row for that menu —
-- created by the Role to Menu screen, or by a broader "grant Super Admin every
-- menu" step — the insert was skipped and the two audit flags stayed at their
-- column default of false. The Audit Log screen then answered 403 for the one
-- role that is supposed to see everything, and the only fix was to know to go
-- and tick two boxes.
--
-- A NEW migration rather than an edit to 0055 (§7.2): 0055 is merged, and
-- databases that took its insert are already correct.
--
-- Deliberately scoped to role 1 and to this one menu. Super Admin is the
-- bootstrap role the whole permission model hangs on (src/db/seed/bootstrapRole
-- .ts) — an install where it cannot read its own audit trail is broken, not
-- configured. Every OTHER role's audit access stays exactly as an operator set
-- it, and Super Admin's can still be removed afterwards from Mapping → Role to
-- Menu; this only fixes the state no one chose.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_view_audit", "can_export_audit", "can_export")
SELECT 1, m."id", true, true, true, true
  FROM "menu_master_t" m
 WHERE m."url" = '/audit-log'
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = 1 AND x."menu_id" = m."id");

UPDATE "role_menu_mapping_t" x
   SET "can_view" = true,
       "can_view_audit" = true,
       "can_export_audit" = true,
       "updated_at" = now()
  FROM "menu_master_t" m
 WHERE m."id" = x."menu_id"
   AND m."url" = '/audit-log'
   AND x."role_id" = 1
   AND (x."can_view" IS NOT TRUE
     OR x."can_view_audit" IS NOT TRUE
     OR x."can_export_audit" IS NOT TRUE);
