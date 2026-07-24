-- bivac_partial_t — PARTIELLE allocation table (Bivac module).
-- Applied out-of-band (drizzle-kit generate needs a TTY in this cloned DB);
-- mirrors src/db/schema/bivacPartial.ts. Idempotent.
CREATE TABLE IF NOT EXISTS bivac_partial_t (
  id                   serial PRIMARY KEY,
  license_id           integer NOT NULL REFERENCES license_t(id),
  partial_name         varchar(255) NOT NULL,
  client_id            integer REFERENCES client_master_t(id),
  partial_weight       numeric(15,2) NOT NULL DEFAULT 0,
  partial_fob          numeric(15,2) NOT NULL DEFAULT 0,
  partial_insurance    numeric(15,2) NOT NULL DEFAULT 0,
  partial_freight      numeric(15,2) NOT NULL DEFAULT 0,
  partial_other_costs  numeric(15,2) NOT NULL DEFAULT 0,
  display              varchar(1) NOT NULL DEFAULT 'Y',
  created_by           integer REFERENCES users_t(id) ON DELETE SET NULL,
  updated_by           integer REFERENCES users_t(id) ON DELETE SET NULL,
  created_at           timestamp NOT NULL DEFAULT now(),
  updated_at           timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bivac_partial_t_partial_name ON bivac_partial_t (partial_name);
CREATE INDEX IF NOT EXISTS idx_bivac_partial_t_license ON bivac_partial_t (license_id);
CREATE INDEX IF NOT EXISTS idx_bivac_partial_t_display ON bivac_partial_t (display);
