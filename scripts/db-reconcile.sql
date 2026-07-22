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

COMMIT;
