-- Excel Report: where each card downloads from.
--
-- The dashboard's cards already know how to COUNT a set of records
-- (`data_source`). What they had no way to say is where that same set can be
-- downloaded, so the Excel Report screen needs one more piece of config.
--
-- A column rather than a convention derived from `data_source` in code (§4.1):
-- an operator can repoint a card at a different export, or give a card no
-- export at all, without a deploy. A card with a NULL export_url is not
-- clickable on that screen — which is the right answer, because the wrong
-- answer is quietly handing over the entire table.
ALTER TABLE "dashboard_card_master_t"
  ADD COLUMN IF NOT EXISTS "export_url" varchar(255);
--> statement-breakpoint

-- Derive it for the cards that already exist, so nobody hand-writes seventeen
-- rows. `<module>/stats` is where a card counts; `<module>/export` is where the
-- same rows download, and the card's own `card_content_id` is the status-filter
-- key the list uses — so the count, the grid and the sheet all narrow through
-- one key (§4.10).
--
-- The summary tiles are excluded: `total` means "no filter", and the money and
-- weight totals are figures rather than a set of rows, so each of those exports
-- its module's full list.
UPDATE "dashboard_card_master_t"
   SET "export_url" =
         replace(split_part("data_source", '#', 1), '/stats', '/export')
         || CASE
              WHEN "card_content_id" IN ('total', 'total_count', 'this_month',
                                         'this_month_count', 'total_fob', 'total_weight')
                THEN ''
              ELSE '?status_filters=' || "card_content_id"
            END,
       "updated_at" = now()
 WHERE "data_source" LIKE '%/stats%'
   AND "export_url" IS NULL;
--> statement-breakpoint

-- Licence cards narrow by `card`, not `status_filters` — their list and export
-- both take that parameter (licenseCardCondition), so they need their own rule.
UPDATE "dashboard_card_master_t"
   SET "export_url" = '/api/v1/licenses/export'
                      || CASE WHEN "card_content_id" = 'total' THEN ''
                              ELSE '?card=' || "card_content_id" END,
       "updated_at" = now()
 WHERE "card_category" = 'license_dashboard';
--> statement-breakpoint

-- The Excel Report screen's own menu entry.
--
-- TOP LEVEL with its own URL, not a child of Dashboard: Dashboard is a
-- clickable leaf rather than a group (seedMenus special-cases it), and hanging a
-- child off it would turn it into a collapsible group and stop the sidebar
-- linking straight to the dashboard. EXTRA_TOP_LEVEL in seedMenus carries the
-- same row for a fresh database.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT NULL, 92, 0, 'Excel Report', '/reports/excel', 'ti ti-file-excel', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/reports/excel');
--> statement-breakpoint

-- §4.7 — a menu with no mapping row is denied to everyone, Super Admin
-- included. Granted to every role that can already reach the dashboard, with
-- export rights inherited rather than invented: the screen only ever downloads.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", d."id",
       true, false, false, false, false, false, false,
       r."can_export", false, r."can_print", false, false, false
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" src ON src."id" = r."menu_id" AND src."url" = '/dashboard'
  JOIN "menu_master_t" d ON d."url" = '/reports/excel'
 WHERE r."can_view" = true
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
