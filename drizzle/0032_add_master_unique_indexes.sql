-- Case-insensitive UNIQUE indexes on the primary name-like field of every
-- single-name master. Implementation: a functional UNIQUE index on LOWER(col).
--
-- Composite-key / multi-name masters are intentionally NOT covered here:
--   users_t                  — has its own UNIQUE on username AND email
--   bank_exchange_rate_t     — uniqueness is (bank_id, exchange_date, currency_id)
--   role_menu_mapping        — composite (role_id, menu_id)
--   role_dashboard_card_*    — composite (role_id, dashboard_card_id)
--   application_settings     — singleton row
--   menu_master_t            — names can repeat under different parents
--   dashboard_cards          — covered by its own logic
--   invoice_bank_master_t    — seed has 'EQUITY BCDC' twice (different accounts);
--                              the unique field is the account number, not the name
--
-- If this migration fails on a CREATE UNIQUE INDEX with "could not create unique
-- index ... already contains duplicates", you have pre-existing case-insensitive
-- duplicates. Clean them up first, then re-run.

-- role_master_t intentionally NOT uniqued: 'Operation Kinshsa' appears twice in the
-- seed dump (rows 43 + 44) and the user has accepted that duplicate role names are
-- valid in this deployment. If that policy changes, add the index here:
--   CREATE UNIQUE INDEX ... ON "role_master_t" (LOWER("role_name"));
CREATE UNIQUE INDEX IF NOT EXISTS "uq_banklist_master_t_bank_name_ci"             ON "banklist_master_t"          (LOWER("bank_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_kind_master_t_kind_name_ci"                 ON "kind_master_t"              (LOWER("kind_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_currency_master_t_currency_name_ci"         ON "currency_master_t"          (LOWER("currency_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_department_master_t_department_name_ci"     ON "department_master_t"        (LOWER("department_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_document_status_master_t_document_status_ci" ON "document_status_master_t"  (LOWER("document_status"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_clearance_master_t_clearance_name_ci"       ON "clearance_master_t"         (LOWER("clearance_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_clearing_status_master_t_clearing_status_ci" ON "clearing_status_master_t"  (LOWER("clearing_status"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_truck_status_master_t_truck_status_ci"      ON "truck_status_master_t"      (LOWER("truck_status"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_transit_point_master_t_transit_point_name_ci" ON "transit_point_master_t"  (LOWER("transit_point_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_transport_mode_master_t_transport_mode_name_ci" ON "transport_mode_master_t" (LOWER("transport_mode_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_unit_master_t_unit_name_ci"                 ON "unit_master_t"              (LOWER("unit_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_regime_master_t_regime_name_ci"             ON "regime_master_t"            (LOWER("regime_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_expense_type_master_t_expense_type_name_ci" ON "expense_type_master_t"      (LOWER("expense_type_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_commodity_master_t_commodity_name_ci"       ON "commodity_master_t"         (LOWER("commodity_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_type_of_goods_master_t_goods_type_ci"       ON "type_of_goods_master_t"     (LOWER("goods_type"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_origin_master_t_origin_name_ci"             ON "origin_master_t"            (LOWER("origin_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_industry_master_t_industry_name_ci"         ON "industry_master_t"          (LOWER("industry_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_group_company_master_t_group_company_name_ci" ON "group_company_master_t"  (LOWER("group_company_name"));
--> statement-breakpoint
-- done_by_t already has a case-sensitive UNIQUE on done_by_name from migration 0023.
-- Add a case-insensitive layer on top (Postgres handles both indexes coexisting).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_done_by_t_done_by_name_ci"                  ON "done_by_t"                  (LOWER("done_by_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_feet_container_master_t_feet_container_size_ci" ON "feet_container_master_t" (LOWER("feet_container_size"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hscode_master_t_hscode_number_ci"           ON "hscode_master_t"            (LOWER("hscode_number"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_incoterm_master_t_incoterm_short_name_ci"   ON "incoterm_master_t"          (LOWER("incoterm_short_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_office_location_master_t_location_name_ci"  ON "office_location_master_t"   (LOWER("location_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_main_office_master_t_main_location_name_ci" ON "main_office_master_t"       (LOWER("main_location_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_province_master_t_province_name_ci"         ON "province_master_t"          (LOWER("province_name"));
