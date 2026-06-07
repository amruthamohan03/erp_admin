-- §4.9 bulk-update config. Creates master_bulk_filter_t and seeds the Import
-- Tracking "pending/missing" filters (the ones the source PHP allowed for bulk
-- editing). Each row carries a structured predicate (translated to safe SQL
-- server-side, columns whitelisted) + the list of fields the editor exposes —
-- replacing the PHP's hardcoded filter→fields map with data.

CREATE TABLE IF NOT EXISTS "master_bulk_filter_t" (
  "id"              serial PRIMARY KEY,
  "page_slug"       varchar(100) NOT NULL,
  "filter_key"      varchar(100) NOT NULL,
  "label"           varchar(255) NOT NULL,
  "predicate"       jsonb NOT NULL,
  "editable_fields" jsonb NOT NULL,
  "display_order"   integer NOT NULL DEFAULT 1,
  "display"         varchar(1) NOT NULL DEFAULT 'Y',
  "created_by"      integer REFERENCES "users_t"("id"),
  "updated_by"      integer REFERENCES "users_t"("id"),
  "created_at"      timestamp NOT NULL DEFAULT now(),
  "updated_at"      timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_master_bulk_filter_t_page_filter"
  ON "master_bulk_filter_t" ("page_slug", "filter_key");

INSERT INTO "master_bulk_filter_t"
  ("page_slug","filter_key","label","predicate","editable_fields","display_order","created_by","updated_by")
VALUES
  ('import','crf_missing','CRF Missing',
   '{"any":[{"col":"crf_reference","op":"empty"},{"col":"crf_received_date","op":"isNull"}]}'::jsonb,
   '["crf_reference","crf_received_date"]'::jsonb, 1, 1, 1),

  ('import','ad_missing','AD Missing',
   '{"col":"ad_date","op":"isNull"}'::jsonb,
   '["ad_date"]'::jsonb, 2, 1, 1),

  ('import','insurance_missing','Insurance Missing',
   '{"any":[{"col":"insurance_date","op":"isNull"},{"col":"insurance_amount","op":"isNull"}]}'::jsonb,
   '["insurance_date","insurance_amount","insurance_reference"]'::jsonb, 3, 1, 1),

  ('import','audited_pending','Audited Pending',
   '{"col":"audited_date","op":"isNull"}'::jsonb,
   '["audited_date"]'::jsonb, 4, 1, 1),

  ('import','archived_pending','Archived Pending',
   '{"col":"archived_date","op":"isNull"}'::jsonb,
   '["archived_date","archive_reference"]'::jsonb, 5, 1, 1),

  ('import','dgda_in_pending','DGDA In Pending',
   '{"col":"dgda_in_date","op":"isNull"}'::jsonb,
   '["dgda_in_date","declaration_reference"]'::jsonb, 6, 1, 1),

  ('import','liquidation_pending','Liquidation Pending',
   '{"col":"liquidation_date","op":"isNull"}'::jsonb,
   '["liquidation_date","liquidation_reference"]'::jsonb, 7, 1, 1),

  ('import','quittance_pending','Quittance Pending',
   '{"col":"quittance_date","op":"isNull"}'::jsonb,
   '["quittance_date","quittance_reference"]'::jsonb, 8, 1, 1),

  ('import','dgda_out_pending','DGDA Out Pending',
   '{"all":[{"col":"dgda_out_date","op":"isNull"},{"col":"quittance_date","op":"isNotNull"}]}'::jsonb,
   '["quittance_date","quittance_reference","dgda_out_date"]'::jsonb, 9, 1, 1),

  ('import','dispatch_deliver_pending','Dispatch/Deliver Pending',
   '{"col":"dispatch_deliver_date","op":"isNull"}'::jsonb,
   '["warehouse_arrival_date","warehouse_departure_date","dispatch_deliver_date"]'::jsonb, 10, 1, 1)
ON CONFLICT ("page_slug","filter_key") DO UPDATE
  SET "label" = EXCLUDED."label",
      "predicate" = EXCLUDED."predicate",
      "editable_fields" = EXCLUDED."editable_fields",
      "display_order" = EXCLUDED."display_order",
      "updated_at" = now();
