-- Export License — its own screens over the SAME licence records.
--
-- `license_t` is direction-agnostic: `kind_id` is the only thing that says
-- whether a licence serves imports or exports, and the kind carries the flags
-- (`use_for_import` / `use_for_export`, migration 0062). So nothing here creates
-- a table, a column or a status. What it creates is a second PAGE over the same
-- rows, plus the menu group that reaches it.
--
-- The field rows are copied FROM the licence page rather than restated, so the
-- two forms start identical and every difference below is deliberate and
-- visible. The cost to know about: from here on a field added to the licence
-- form must be added to this page too — see the note at the end.

-- 1. The page itself. Same target table; its own route, so §4.13 back-navigation
--    returns to the export list instead of the import one.
INSERT INTO "master_page_t" ("slug", "title", "route", "target_table", "display_order", "display")
SELECT 'export-license', 'Export License', '/export-licenses', 'license_t', 11, 'Y'
WHERE NOT EXISTS (SELECT 1 FROM "master_page_t" WHERE "slug" = 'export-license');
--> statement-breakpoint

-- 2. Its accordions, copied from the licence page in the same order.
INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "props", "display_order")
SELECT ep."id", a."slug", a."title", a."icon", a."props", a."display_order"
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" lp ON lp."id" = a."page_id" AND lp."slug" = 'license'
  CROSS JOIN "master_page_t" ep
 WHERE ep."slug" = 'export-license'
   AND NOT EXISTS (
     SELECT 1 FROM "master_page_accordion_t" x
      WHERE x."page_id" = ep."id" AND x."slug" = a."slug"
   );
--> statement-breakpoint

-- 3. Its fields, matched accordion-to-accordion by slug.
INSERT INTO "master_page_accordion_field_t"
  ("accordion_id", "name", "label", "field_type", "required", "options_source",
   "options_label_field", "options_static", "props", "conditions", "derive", "display_order")
SELECT ea."id", f."name", f."label", f."field_type", f."required", f."options_source",
       f."options_label_field", f."options_static", f."props", f."conditions", f."derive",
       f."display_order"
  FROM "master_page_accordion_field_t" f
  JOIN "master_page_accordion_t" la ON la."id" = f."accordion_id"
  JOIN "master_page_t" lp ON lp."id" = la."page_id" AND lp."slug" = 'license'
  JOIN "master_page_t" ep ON ep."slug" = 'export-license'
  JOIN "master_page_accordion_t" ea ON ea."page_id" = ep."id" AND ea."slug" = la."slug"
 WHERE NOT EXISTS (
   SELECT 1 FROM "master_page_accordion_field_t" x
    WHERE x."accordion_id" = ea."id" AND x."name" = f."name"
 );
--> statement-breakpoint

-- 4. Section permissions, copied too. §4.7 — an accordion with no grant row is
--    invisible to every role, so without this the new page renders empty.
INSERT INTO "master_page_accordion_role_t" ("accordion_id", "role_id", "permission")
SELECT ea."id", r."role_id", r."permission"
  FROM "master_page_accordion_role_t" r
  JOIN "master_page_accordion_t" la ON la."id" = r."accordion_id"
  JOIN "master_page_t" lp ON lp."id" = la."page_id" AND lp."slug" = 'license'
  JOIN "master_page_t" ep ON ep."slug" = 'export-license'
  JOIN "master_page_accordion_t" ea ON ea."page_id" = ep."id" AND ea."slug" = la."slug"
 WHERE NOT EXISTS (
   SELECT 1 FROM "master_page_accordion_role_t" x
    WHERE x."accordion_id" = ea."id" AND x."role_id" = r."role_id"
      AND x."permission" = r."permission"
 );
--> statement-breakpoint

-- 5. The one deliberate difference: each page offers only its own kinds.
--    `kinds?group=export` is the existing endpoint filter (0099 uses the same
--    form for export invoices), so this is config, not a renderer special case.
--    An operator can no longer raise an import licence from the export screen.
UPDATE "master_page_accordion_field_t" f
   SET "options_source" = 'kinds?group=export', "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id" AND p."slug" = 'export-license' AND f."name" = 'kind_id';
--> statement-breakpoint

UPDATE "master_page_accordion_field_t" f
   SET "options_source" = 'kinds?group=import', "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id" AND p."slug" = 'license' AND f."name" = 'kind_id';
--> statement-breakpoint

-- 6. The menu group. Parent resolved BY NAME from the table, the pattern 0089
--    established: on a fresh database menus are seeded after migrations run, so
--    the SELECT finds nothing and this is a no-op rather than an FK violation.
--    seedMenus carries the same rows for that case.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT NULL, 6, 0, 'Export License', '#', 'ti ti-file-certificate', 'Y'
WHERE NOT EXISTS (
  SELECT 1 FROM "menu_master_t" WHERE "menu_name" = 'Export License' AND "menu_level" = 0
);
--> statement-breakpoint

INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", c."ord", 1, c."name", c."url", '', 'Y'
  FROM "menu_master_t" p
  CROSS JOIN (VALUES
    (1, 'Create Export License', '/export-licenses/new'),
    (2, 'Export License Dashboard', '/export-licenses/dashboard'),
    (3, 'Export Licenses (list)', '/export-licenses')
  ) AS c("ord", "name", "url")
 WHERE p."menu_name" = 'Export License' AND p."menu_level" = 0
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = c."url");
--> statement-breakpoint

-- 7. §4.7 — the menu URL IS the permission resource. Granted to every role that
--    can already see the licence list, and each new screen inherits that role's
--    rights on the twin it mirrors: the list/dashboard are read-only, the create
--    screen carries whatever add/edit the role holds on /licenses.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", d."id",
       true,
       CASE WHEN d."url" = '/export-licenses/new' THEN r."can_add"  ELSE false END,
       CASE WHEN d."url" = '/export-licenses/new' THEN r."can_edit" ELSE false END,
       false, false, false, false,
       r."can_export", false, r."can_print",
       false, false, false
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" lst ON lst."id" = r."menu_id" AND lst."url" = '/licenses'
  JOIN "menu_master_t" d ON d."url" IN
       ('/export-licenses', '/export-licenses/dashboard', '/export-licenses/new')
 WHERE r."can_view" = true
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
--> statement-breakpoint

-- 8. The existing group now says what it actually holds. Its screens are scoped
--    to import kinds from this release, so "Import License" is no longer a
--    label over both directions.
UPDATE "menu_master_t"
   SET "menu_name" = 'Import Licenses (list)', "updated_at" = now()
 WHERE "url" = '/licenses' AND "menu_name" = 'Licenses (list)';
--> statement-breakpoint

UPDATE "menu_master_t"
   SET "menu_name" = 'Import License Dashboard', "updated_at" = now()
 WHERE "url" = '/licenses/dashboard' AND "menu_name" = 'License Dashboard';

-- NOTE for whoever adds a licence field next: there are now TWO page configs
-- over license_t ('license' and 'export-license'). A field added to one does not
-- appear on the other. If that proves to be a maintenance burden rather than a
-- feature, the way back is a single page with a per-route options filter — which
-- the runtime cannot express today.
