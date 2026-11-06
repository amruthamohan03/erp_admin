-- Masters → Air Operating Companies, and Import Tracking's Operating Company
-- field reading from it (it read the Group Companies master before, which is the
-- client holding-group list, not air operators).
--
-- The field keeps storing the operator's NAME in imports_t.operating_company
-- (props.optionsValueField), exactly as it did with group companies, so existing
-- files need no data change and the column keeps its type.
CREATE TABLE IF NOT EXISTS "air_operating_company_master_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "air_operating_company_name" varchar(50) NOT NULL,
  "display" varchar(1) DEFAULT 'Y' NOT NULL,
  "created_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_air_operating_company_master_t_name"
  ON "air_operating_company_master_t" (upper("air_operating_company_name"));
--> statement-breakpoint
-- Every operating company already written on a file becomes a row, so the
-- dropdown can still show and re-select what those files hold.
INSERT INTO "air_operating_company_master_t" ("air_operating_company_name")
SELECT DISTINCT ON (upper(btrim(i."operating_company"))) btrim(i."operating_company")
  FROM "imports_t" i
 WHERE NULLIF(btrim(i."operating_company"), '') IS NOT NULL
 ORDER BY upper(btrim(i."operating_company")), btrim(i."operating_company")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "master_page_accordion_field_t" f
   SET "options_source" = 'air-operating-companies',
       "options_label_field" = 'air_operating_company_name',
       "props" = COALESCE(f."props", '{}'::jsonb)
                 || '{"optionsValueField":"air_operating_company_name"}'::jsonb,
       "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id"
   AND p."slug" = 'import'
   AND f."name" = 'operating_company';
--> statement-breakpoint
-- Under Masters, after the last entry there.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id",
       COALESCE((SELECT max(c."menu_order") FROM "menu_master_t" c WHERE c."menu_id" = p."id"), 0) + 1,
       1, 'Air Operating Companies', '/masters/air-operating-companies', '', 'Y'
  FROM "menu_master_t" p
 WHERE p."menu_name" = 'Masters' AND p."menu_level" = 0
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/masters/air-operating-companies');
--> statement-breakpoint
-- Super Admin only; every other role is granted under Mapping → Role to Menu.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT 1, m."id", true, true, true, true, true, true, true, true, true, true, true, true, true
  FROM "menu_master_t" m
 WHERE m."url" = '/masters/air-operating-companies'
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x WHERE x."role_id" = 1 AND x."menu_id" = m."id");
