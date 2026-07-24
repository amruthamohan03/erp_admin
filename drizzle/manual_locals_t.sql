-- locals_t — Local Tracking (mirrors src/db/schema/locals.ts). Idempotent.
CREATE TABLE IF NOT EXISTS locals_t (
  id                         serial PRIMARY KEY,
  client_id                  integer REFERENCES client_master_t(id),
  location                   integer REFERENCES main_office_master_t(id),
  mca_lt_reference           varchar(100),
  lot_num                    varchar(100),
  horse                      varchar(100),
  trailer_1                  varchar(100),
  trailer_2                  varchar(100),
  transporter                varchar(100),
  nbr_of_bags                integer,
  weight                     numeric(12,2),
  arrival_date               date,
  loading_date               date,
  bp_details_received_date   date,
  pv_div_mines_date          date,
  demande_attestation_date   date,
  ceec_in                    date,
  ceec_out                   date,
  cgea                       varchar(100),
  gov_docs_complete_date     date,
  disp_date                  date,
  end_of_formalities         date,
  remarks                    text,
  display                    varchar(1) NOT NULL DEFAULT 'Y',
  created_by                 integer REFERENCES users_t(id) ON DELETE SET NULL,
  updated_by                 integer REFERENCES users_t(id) ON DELETE SET NULL,
  created_at                 timestamp NOT NULL DEFAULT now(),
  updated_at                 timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_locals_t_mca_lt_reference ON locals_t (mca_lt_reference) WHERE mca_lt_reference IS NOT NULL AND mca_lt_reference <> '';
CREATE INDEX IF NOT EXISTS idx_locals_t_client ON locals_t (client_id);
CREATE INDEX IF NOT EXISTS idx_locals_t_location ON locals_t (location);
CREATE INDEX IF NOT EXISTS idx_locals_t_display ON locals_t (display);
