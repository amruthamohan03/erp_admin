-- §4.29 — the three comparison dashboards and the menu entries that reach
-- them (§4.7: the menu URL is the permission resource, so without a row there
-- is no link and no grant).
--
--   /clients/comparison   beside the Client Dashboard   (/clients/dashboard)
--   /licenses/comparison  beside the Licence Dashboard  (/licenses/dashboard)
--   /tracking/comparison  beside the Import Tracking Dashboard (/imports/dashboard)
--
-- Each is filed under WHATEVER parent its neighbour has in this database, one
-- step after it, rather than under a parent named here — the seed and live
-- databases disagree on where these sit.
--
-- Guarded on the url, so this is safe to re-run.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT n."menu_id", COALESCE(n."menu_order", 0) + 1, n."menu_level", s.name, s.url, '', 'Y'
  FROM (VALUES
    ('Client Comparison', '/clients/comparison', '/clients/dashboard'),
    ('License Comparison', '/licenses/comparison', '/licenses/dashboard'),
    ('Tracking Comparison', '/tracking/comparison', '/imports/dashboard')
  ) AS s(name, url, beside)
  JOIN LATERAL (
    SELECT m."menu_id", m."menu_order", m."menu_level"
      FROM "menu_master_t" m
     WHERE m."url" = s.beside
     ORDER BY m."id"
     LIMIT 1
  ) n ON true
 WHERE NOT EXISTS (SELECT 1 FROM "menu_master_t" x WHERE x."url" = s.url);
--> statement-breakpoint

-- Granted to every role that can view the neighbouring dashboard — whoever may
-- read those figures may compare them. Read-only, so only can_view is implied;
-- export/print carry across. bool_or merges a role mapped to the neighbour
-- through more than one menu row.
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
  FROM (VALUES
    ('/clients/comparison', '/clients/dashboard'),
    ('/licenses/comparison', '/licenses/dashboard'),
    ('/tracking/comparison', '/imports/dashboard')
  ) AS s(url, beside)
  JOIN "menu_master_t" nb ON nb."url" = s.beside
  JOIN "role_menu_mapping_t" r ON r."menu_id" = nb."id" AND r."can_view" = true
  JOIN "menu_master_t" d ON d."url" = s.url
 WHERE NOT EXISTS (
   SELECT 1 FROM "role_menu_mapping_t" x WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
 )
 GROUP BY r."role_id", d."id";
