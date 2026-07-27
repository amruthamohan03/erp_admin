-- §5 PARTIELLE allotment table (mirrors src/db/schema/partial.ts).
CREATE TABLE IF NOT EXISTS partial_t (
  id serial PRIMARY KEY,
  partial_name varchar(100) NOT NULL,
  license_id integer REFERENCES license_t(id),
  client_id integer REFERENCES client_master_t(id),
  partial_weight numeric(15,3) NOT NULL DEFAULT 0,
  partial_fob numeric(15,2) NOT NULL DEFAULT 0,
  license_weight numeric(15,3),
  license_fob numeric(15,2),
  license_insurance numeric(15,2),
  license_freight numeric(15,2),
  license_other_costs numeric(15,2),
  display varchar(1) NOT NULL DEFAULT 'Y',
  created_by integer REFERENCES users_t(id) ON DELETE SET NULL,
  updated_by integer REFERENCES users_t(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_partial_t_name ON partial_t(partial_name);
CREATE INDEX IF NOT EXISTS idx_partial_t_license ON partial_t(license_id);
-- The PARTIELLE string link + its usage rollups (doc §17 index suggestions).
CREATE INDEX IF NOT EXISTS idx_imports_inspection ON imports_t(inspection_reports, display);
