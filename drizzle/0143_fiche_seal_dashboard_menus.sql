-- §4.29 — the Fiche de Calcul and Seal Tracker dashboards, and the menu entries
-- that reach them (§4.7: the menu URL is the permission resource, so without a
-- row there is no link AND no grant).
--
--   /fiches/dashboard        beside the Fiche de Calcul list (/fiches)
--   /masters/seals/dashboard beside the Seal Tracker list (/masters/seals)
--
-- Each dashboard is placed under WHATEVER parent its list already has in this
-- database, one step ahead of it, rather than under a parent named here: the
-- seed files and live databases disagree on where these lists sit, and a
-- dashboard filed under a different group from its list would be hard to find.
--
-- /masters/seals has two menu rows (Masters → Seal and Seal Tracker → Seal
-- Tracker). The dashboard goes beside the one outside Masters, which is the
-- module's own group.
--
-- Guarded on the url, so this is safe to re-run.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT l."menu_id", GREATEST(COALESCE(l."menu_order", 1) - 1, 0), l."menu_level",
       'Fiche de Calcul Dashboard', '/fiches/dashboard', '', 'Y'
  FROM "menu_master_t" l
 WHERE l."url" = '/fiches'
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/fiches/dashboard')
 ORDER BY l."id"
 LIMIT 1;
--> statement-breakpoint

INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT l."menu_id", GREATEST(COALESCE(l."menu_order", 1) - 1, 0), l."menu_level",
       'Seal Dashboard', '/masters/seals/dashboard', '', 'Y'
  FROM "menu_master_t" l
  LEFT JOIN "menu_master_t" p ON p."id" = l."menu_id"
 WHERE l."url" = '/masters/seals'
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/masters/seals/dashboard')
 ORDER BY (lower(COALESCE(p."menu_name", '')) = 'masters'), l."id"
 LIMIT 1;
--> statement-breakpoint

-- Granted to every role that can already view the matching list: whoever may
-- read those records may read their figures. The dashboards are read-only, so
-- only can_view is implied; export/print carry across from the list. Rights are
-- merged per role with bool_or, because /masters/seals has two menu rows and a
-- role mapped to both must still get exactly one row here.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", d."id",
       true,
       false, false, false, false,
       false, false,
       bool_or(r."can_export"), bool_or(r."can_import"), bool_or(r."can_print"),
       false, false, false
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" lst ON lst."id" = r."menu_id"
  JOIN "menu_master_t" d ON d."url" = lst."url" || '/dashboard'
 WHERE lst."url" IN ('/fiches', '/masters/seals')
   AND r."can_view" = true
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   )
 GROUP BY r."role_id", d."id";
