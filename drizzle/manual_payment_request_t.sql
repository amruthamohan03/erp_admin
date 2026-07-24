-- Payment module tables (transaction-pages build). Applied out-of-band
-- (drizzle-kit generate needs a TTY in this cloned DB); mirrors
-- src/db/schema/paymentRequest.ts + paymentStageRole.ts. Idempotent.

CREATE TABLE IF NOT EXISTS payment_stage_role_master_t (
  id          serial PRIMARY KEY,
  stage       varchar(20) NOT NULL,
  role_id     integer NOT NULL REFERENCES role_master_t(id),
  display     varchar(1) NOT NULL DEFAULT 'Y',
  created_by  integer REFERENCES users_t(id) ON DELETE SET NULL,
  updated_by  integer REFERENCES users_t(id) ON DELETE SET NULL,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_stage_role_t ON payment_stage_role_master_t (stage, role_id);

CREATE TABLE IF NOT EXISTS payment_request_t (
  id             serial PRIMARY KEY,
  beneficiary    varchar(200),
  requestee      varchar(200) NOT NULL,
  department     integer REFERENCES department_master_t(id),
  location_id    integer REFERENCES main_office_master_t(id),
  client_id      integer REFERENCES client_master_t(id),
  pay_for        smallint,
  currency       integer REFERENCES currency_master_t(id),
  amount         numeric(15,2) NOT NULL DEFAULT 0,
  payment_type   varchar(10),
  expense_type   integer REFERENCES expense_type_master_t(id),
  motif          text,
  cash_collector varchar(100),
  mca_ref        varchar(255),
  mca_data       jsonb DEFAULT '[]'::jsonb,
  chargeback     numeric(15,2),
  file1_path     varchar(500),
  file2_path     varchar(500),
  file3_path     varchar(500),
  file4_path     varchar(500),
  dept_approval        smallint,
  dept_approved_at     timestamp,
  dept_approved_by     integer REFERENCES users_t(id) ON DELETE SET NULL,
  dept_notes           text,
  finance_approval     smallint,
  finance_approved_at  timestamp,
  finance_approved_by  integer REFERENCES users_t(id) ON DELETE SET NULL,
  finance_notes        text,
  management_approval    smallint,
  management_approved_at timestamp,
  management_approved_by integer REFERENCES users_t(id) ON DELETE SET NULL,
  management_notes       text,
  under_process        smallint,
  under_process_at     timestamp,
  under_process_by     integer REFERENCES users_t(id) ON DELETE SET NULL,
  under_process_notes  text,
  paid_approval        smallint,
  paid_approved_at     timestamp,
  paid_approved_by     integer REFERENCES users_t(id) ON DELETE SET NULL,
  paid_notes           text,
  display     varchar(1) NOT NULL DEFAULT 'Y',
  created_by  integer REFERENCES users_t(id) ON DELETE SET NULL,
  updated_by  integer REFERENCES users_t(id) ON DELETE SET NULL,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_request_t_created_by ON payment_request_t (created_by);
CREATE INDEX IF NOT EXISTS idx_payment_request_t_location ON payment_request_t (location_id);
CREATE INDEX IF NOT EXISTS idx_payment_request_t_type ON payment_request_t (payment_type);
