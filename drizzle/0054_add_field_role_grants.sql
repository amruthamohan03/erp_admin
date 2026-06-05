-- §4.14 — field-level role grants. Overrides the accordion permission for one
-- (field, role); absence = inherit the accordion. No data backfill: every
-- existing field inherits its accordion grant, so the 3 existing transactional
-- pages (clients/license/import) keep working unchanged.
CREATE TABLE IF NOT EXISTS "master_page_accordion_field_role_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "field_id" integer NOT NULL REFERENCES "master_page_accordion_field_t"("id") ON DELETE CASCADE,
  "role_id" integer NOT NULL REFERENCES "role_master_t"("id") ON DELETE CASCADE,
  "permission" varchar(10) NOT NULL,
  "created_by" integer REFERENCES "users_t"("id"),
  "updated_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "chk_field_role_permission" CHECK ("permission" IN ('view','edit','hidden'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_master_page_accordion_field_role_t" ON "master_page_accordion_field_role_t" ("field_id","role_id");
