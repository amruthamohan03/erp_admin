-- 0054 — §4.28: make audit_log_t able to record what the spec asks it to.
--
-- Two gaps. The action CHECK allowed seven values where the spec lists twenty-odd
-- (restore, permanent_delete, export, print, failed_login…), so those writes would
-- have been rejected outright. And the row captured no actor role, module, IP or
-- device — all "where applicable" fields in §4.28, and all needed by the
-- user-wise / module-wise views of the audit dashboard.
--
-- Stored as columns rather than inside `metadata` because the dashboard filters
-- and groups by them; a JSONB probe cannot use an index the way these can.

ALTER TABLE "audit_log_t"
  ADD COLUMN IF NOT EXISTS "actor_role" varchar(100),
  ADD COLUMN IF NOT EXISTS "module" varchar(100),
  ADD COLUMN IF NOT EXISTS "ip_address" varchar(45),
  ADD COLUMN IF NOT EXISTS "user_agent" text;

-- The role is denormalised on purpose: it records who the actor WAS at the time.
-- Joining to users_t later would report their role today, which is exactly the
-- question an audit trail must not answer.
COMMENT ON COLUMN "audit_log_t"."actor_role" IS
  'Role name at the time of the action — deliberately not resolved by join.';

ALTER TABLE "audit_log_t" DROP CONSTRAINT IF EXISTS "audit_log_t_action_check";
ALTER TABLE "audit_log_t"
  ADD CONSTRAINT "audit_log_t_action_check" CHECK ("action" IN (
    'login', 'logout', 'failed_login',
    'create', 'view', 'update',
    'delete', 'restore', 'permanent_delete',
    'approve', 'reject', 'submit', 'cancel',
    'export', 'import', 'download', 'print',
    'status_change', 'role_change', 'permission_change', 'user_change',
    'settings_change', 'transition'
  ));

-- The dashboard groups by module and by action over a date range; without these
-- every card is a sequential scan of the whole log.
CREATE INDEX IF NOT EXISTS "idx_audit_log_t_module" ON "audit_log_t" ("module");
CREATE INDEX IF NOT EXISTS "idx_audit_log_t_action" ON "audit_log_t" ("action");

-- Backfill `module` from the entity_type already recorded, so existing history
-- appears in the module views rather than as a null bucket.
UPDATE "audit_log_t"
   SET "module" = CASE
     WHEN "entity_type" LIKE 'page:%'        THEN split_part("entity_type", ':', 2)
     WHEN "entity_type" LIKE 'recycle-bin:%' THEN 'recycle-bin'
     WHEN "entity_type" LIKE 'application-settings%' THEN 'settings'
     ELSE "entity_type"
   END
 WHERE "module" IS NULL;
