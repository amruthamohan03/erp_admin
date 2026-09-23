-- Scope a login to one client's data.
--
-- `users_t.client_id` is the ONE fact that decides it: NULL means a member of
-- staff and changes nothing (every existing account is NULL and stays that
-- way), set means every list, detail, dashboard and export that account can
-- reach is narrowed to that client's rows.
--
-- A column rather than a role flag, deliberately. §4.7 forbids deciding
-- anything by role NAME, and a role is shared by many people — two different
-- clients could not both use a single "Client" role without a second mapping
-- anyway. WHICH menus a client login can reach stays the role's job
-- (role_menu_mapping_t); this decides only which ROWS it sees inside them.
--
-- ON DELETE SET NULL, matching location_id/dept_id: an account outlives the
-- client record it was created against. Note the consequence — a user whose
-- client is hard-deleted becomes UNSCOPED rather than locked out, so a client
-- account must be disabled (display = 'N') and not left to a cascade.
ALTER TABLE "users_t" ADD COLUMN IF NOT EXISTS "client_id" integer;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_t_client_id_fkey'
  ) THEN
    ALTER TABLE "users_t"
      ADD CONSTRAINT "users_t_client_id_fkey"
      FOREIGN KEY ("client_id") REFERENCES "client_master_t"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint

-- Every scoped query filters on this column, on every table that carries a
-- client. The index is on the users side because the lookup is "what is this
-- account scoped to", once per request.
CREATE INDEX IF NOT EXISTS "idx_users_t_client" ON "users_t" ("client_id");
