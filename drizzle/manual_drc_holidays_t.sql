-- drc_holidays_t — DRC public holidays (mirrors src/db/schema/drcHolidays.ts).
CREATE TABLE IF NOT EXISTS drc_holidays_t (
  id            serial PRIMARY KEY,
  holiday_date  date NOT NULL,
  name_en       varchar(150) NOT NULL,
  name_fr       varchar(150),
  holiday_type  varchar(20) NOT NULL DEFAULT 'fixed',
  display       varchar(1) NOT NULL DEFAULT 'Y',
  created_by    integer REFERENCES users_t(id) ON DELETE SET NULL,
  updated_by    integer REFERENCES users_t(id) ON DELETE SET NULL,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drc_holidays_t_date ON drc_holidays_t (holiday_date);
