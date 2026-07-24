-- Reconcile a DB cloned from main (erp_admin_main) to the SQL table/column
-- names the restructure branch expects. Run ONCE, right after loading main's
-- data into the restructure DB:
--     psql "$RESTRUCTURE_DATABASE_URL" -f scripts/db-reconcile.sql
-- Idempotent-ish: safe to run on a fresh clone; re-running after it succeeded
-- will error on the already-renamed tables (that's fine — it means it's done).

BEGIN;

-- Tables where restructure kept a different SQL name than main:
ALTER TABLE clients_t                 RENAME TO client_master_t;
ALTER TABLE licenses_t                RENAME TO license_t;
ALTER TABLE seal_nos_t                RENAME TO seal_batch_t;
ALTER TABLE seal_individual_numbers_t RENAME TO seal_number_t;
ALTER TABLE refferer_master_t         RENAME TO referer_master_t;
ALTER TABLE done_by_t                 RENAME TO done_by_master_t;
ALTER TABLE partial_t                 RENAME TO partial_master_t;

-- Column-name deltas:
ALTER TABLE seal_number_t    RENAME COLUMN seal_master_id TO seal_batch_id;
ALTER TABLE referer_master_t RENAME COLUMN refferer_name  TO referer_name;

-- Additive columns the restructure schema has that main lacks (nullable):
ALTER TABLE client_master_t  ADD COLUMN IF NOT EXISTS id_nat_file_id        integer;
ALTER TABLE client_master_t  ADD COLUMN IF NOT EXISTS rccm_file_id          integer;
ALTER TABLE client_master_t  ADD COLUMN IF NOT EXISTS import_export_file_id integer;
ALTER TABLE client_master_t  ADD COLUMN IF NOT EXISTS attestation_file_id   integer;
ALTER TABLE done_by_master_t ADD COLUMN IF NOT EXISTS created_by integer;
ALTER TABLE done_by_master_t ADD COLUMN IF NOT EXISTS updated_by integer;

-- Point the master_page form config at restructure's table + route names:
UPDATE master_page_t SET target_table = 'client_master_t' WHERE slug = 'clients';
UPDATE master_page_t SET target_table = 'license_t'       WHERE slug = 'license';
UPDATE master_page_accordion_field_t SET options_source = 'goods-types'
 WHERE options_source = 'type-of-goods';
-- The referer column was renamed refferer_name -> referer_name (above), but the
-- form field's label config still pointed at the old spelling, so the "Referred
-- By" dropdown fell back to showing the raw id.
UPDATE master_page_accordion_field_t SET options_label_field = 'referer_name'
 WHERE options_label_field = 'refferer_name';

-- Clients page config reconciliation (cross-checked against the PHP
-- Client Management module spec):
--   * drop the stray debug "test" select left on the form
--   * contact_person / invoice_template are optional per the spec — the only
--     6 mandatory fields are company_name, short_name, client_type,
--     payment_term, liquidation_paid_by, license_submit_to_bank
--   * company_name is spec-unique; add the CI unique index (sibling of
--     uq_clients_t_short_name_ci) and the uniquenessSlug prop for parity.
UPDATE master_page_accordion_field_t f SET display = 'N'
  FROM master_page_accordion_t a
  WHERE f.accordion_id = a.id
    AND a.page_id = (SELECT id FROM master_page_t WHERE slug = 'clients')
    AND f.name = 'test';
UPDATE master_page_accordion_field_t f SET required = false
  FROM master_page_accordion_t a
  WHERE f.accordion_id = a.id
    AND a.page_id = (SELECT id FROM master_page_t WHERE slug = 'clients')
    AND f.name IN ('contact_person', 'invoice_template');
UPDATE master_page_accordion_field_t f
  SET props = COALESCE(f.props, '{}'::jsonb)
              || '{"uniquenessSlug":"clients-company-name"}'::jsonb
  FROM master_page_accordion_t a
  WHERE f.accordion_id = a.id
    AND a.page_id = (SELECT id FROM master_page_t WHERE slug = 'clients')
    AND f.name = 'company_name';
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_t_company_name_ci
  ON client_master_t (lower(company_name));

-- License page config reconciliation (cross-checked against the License
-- Management module spec, §3 matrix + §4 rules). All scoped to slug='license'.
--   D2 — Insurance / Freight / Other Costs are hidden + NULL for MCA kinds.
--   D4 — Invoice File is visible (optional) for Special, not Standard-only.
--   D3 — License Cleared By auto-fills from the client's default (§2.2), editable.
--   D1 — MCA licence number auto-generates from the 4 short codes (§4.5), editable,
--        MCA kinds only (needs the editable/multi-trigger/when derive-runtime knobs).
UPDATE master_page_accordion_field_t f
  SET conditions = COALESCE(f.conditions, '{}'::jsonb)
                   || '{"visibleWhen":{"nin":[5,6,7],"field":"kind_id"}}'::jsonb
  FROM master_page_accordion_t a
  WHERE f.accordion_id = a.id
    AND a.page_id = (SELECT id FROM master_page_t WHERE slug = 'license')
    AND f.name IN ('insurance', 'freight', 'other_costs');
UPDATE master_page_accordion_field_t f
  SET conditions = jsonb_set(f.conditions, '{visibleWhen}',
                             '{"nin":[5,6,7],"field":"kind_id"}'::jsonb)
  FROM master_page_accordion_t a
  WHERE f.accordion_id = a.id
    AND a.page_id = (SELECT id FROM master_page_t WHERE slug = 'license')
    AND f.name = 'invoice_file';
UPDATE master_page_accordion_field_t f
  SET derive = '{"kind":"fromRelated","trigger":"client_id","source":"client","column":"license_cleared_by","editable":true}'::jsonb
  FROM master_page_accordion_t a
  WHERE f.accordion_id = a.id
    AND a.page_id = (SELECT id FROM master_page_t WHERE slug = 'license')
    AND f.name = 'license_cleared_by';
UPDATE master_page_accordion_field_t f
  SET derive = '{"kind":"template","trigger":["client_id","kind_id","type_of_goods_id","transport_mode_id"],"source":"license_mca","template":"{client_short}-{kind_short}-{goods_short}-{transport_letter}","when":{"in":[5,6,7],"field":"kind_id"},"editable":true}'::jsonb
  FROM master_page_accordion_t a
  WHERE f.accordion_id = a.id
    AND a.page_id = (SELECT id FROM master_page_t WHERE slug = 'license')
    AND f.name = 'license_number';

COMMIT;
