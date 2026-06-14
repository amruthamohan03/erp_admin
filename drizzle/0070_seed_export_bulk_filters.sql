-- §4.9 bulk-update config for Export Tracking. Seeds master_bulk_filter_t (created
-- in 0061) with the "pending/missing" filters the legacy ExportController allowed
-- for bulk editing. Each row carries a structured predicate (translated to safe SQL
-- server-side, columns whitelisted against the export page target) + the fields the
-- editor exposes — the PHP filter→fields map as data. Idempotent.

INSERT INTO "master_bulk_filter_t"
  ("page_slug","filter_key","label","predicate","editable_fields","display_order","created_by","updated_by")
VALUES
  ('export','ceec_pending','CEEC Pending',
   '{"any":[{"col":"ceec_in_date","op":"isNull"},{"col":"ceec_out_date","op":"isNull"}]}'::jsonb,
   '["ceec_in_date","ceec_out_date","pv_date","demande_attestation_date","assay_date"]'::jsonb, 1, 1, 1),

  ('export','min_div_pending','Min Div Pending',
   '{"any":[{"col":"min_div_in_date","op":"isNull"},{"col":"min_div_out_date","op":"isNull"}]}'::jsonb,
   '["min_div_in_date","min_div_out_date"]'::jsonb, 2, 1, 1),

  ('export','gov_docs_pending','Gov Docs Pending',
   '{"any":[{"col":"gov_docs_in_date","op":"isNull"},{"col":"gov_docs_out_date","op":"isNull"}]}'::jsonb,
   '["gov_docs_in_date","gov_docs_out_date"]'::jsonb, 3, 1, 1),

  ('export','dgda_in_pending','DGDA In Pending',
   '{"col":"dgda_in_date","op":"isNull"}'::jsonb,
   '["dgda_in_date","declaration_reference","customs_clearing_code"]'::jsonb, 4, 1, 1),

  ('export','liquidation_pending','Liquidation Pending',
   '{"col":"liquidation_date","op":"isNull"}'::jsonb,
   '["liquidation_date","liquidation_reference","liquidation_amount"]'::jsonb, 5, 1, 1),

  ('export','quittance_pending','Quittance Pending',
   '{"col":"quittance_date","op":"isNull"}'::jsonb,
   '["quittance_date","quittance_reference"]'::jsonb, 6, 1, 1),

  ('export','dispatch_pending','Dispatch Pending',
   '{"col":"dispatch_deliver_date","op":"isNull"}'::jsonb,
   '["dispatch_deliver_date"]'::jsonb, 7, 1, 1),

  ('export','audited_pending','Audited Pending',
   '{"col":"audited_date","op":"isNull"}'::jsonb,
   '["audited_date"]'::jsonb, 8, 1, 1),

  ('export','archived_pending','Archived Pending',
   '{"col":"archived_date","op":"isNull"}'::jsonb,
   '["archived_date","archive_reference"]'::jsonb, 9, 1, 1),

  ('export','lmc_date_pending','LMC Date Pending',
   '{"col":"lmc_date","op":"isNull"}'::jsonb,
   '["lmc_date","lmc_id"]'::jsonb, 10, 1, 1),

  ('export','ogefrem_date_pending','OGEFREM Date Pending',
   '{"col":"ogefrem_date","op":"isNull"}'::jsonb,
   '["ogefrem_date","ogefrem_inv_ref"]'::jsonb, 11, 1, 1),

  ('export','seal_pending','Seal Pending',
   '{"any":[{"col":"dgda_seal_no","op":"empty"},{"col":"number_of_seals","op":"isNull"}]}'::jsonb,
   '["dgda_seal_no","number_of_seals"]'::jsonb, 12, 1, 1),

  ('export','lmc_id_pending','LMC ID Pending',
   '{"col":"lmc_id","op":"empty"}'::jsonb,
   '["lmc_id"]'::jsonb, 13, 1, 1),

  ('export','ogefrem_ref_pending','OGEFREM Ref Pending',
   '{"col":"ogefrem_inv_ref","op":"empty"}'::jsonb,
   '["ogefrem_inv_ref"]'::jsonb, 14, 1, 1)
ON CONFLICT ("page_slug","filter_key") DO UPDATE
  SET "label" = EXCLUDED."label",
      "predicate" = EXCLUDED."predicate",
      "editable_fields" = EXCLUDED."editable_fields",
      "display_order" = EXCLUDED."display_order",
      "updated_at" = now();
