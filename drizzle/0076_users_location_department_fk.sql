-- 0076 — users_t.location_id / dept_id become master foreign keys (§4.1).
--
-- Both were varchar(100) free text and the Users form asked for "Location ID"
-- and "Department ID" as typed numbers, which is the shape §4.1 exists to
-- prevent: the value an operator types has no relationship to the master it is
-- supposed to name, so nothing can join on it and nothing can validate it.
-- Every row is NULL today, so no data is at risk in the conversion.
--
-- location_id -> main_office_master_t: the five branch cities (LUBUMBASHI,
-- KOLWEZI, KASUMBALESA, LIKASI, KINSHASA) are the offices staff are actually
-- posted to, and they are what Declaration Offices hang off. Repointing this at
-- office_location_master_t later is one FK and one options_source.

-- Numeric-looking text survives as an id; anything else becomes NULL rather
-- than failing the whole migration on one bad row.
ALTER TABLE users_t
  ALTER COLUMN location_id TYPE integer
  USING (CASE WHEN btrim(COALESCE(location_id, '')) ~ '^[0-9]+$'
              THEN btrim(location_id)::integer END);

ALTER TABLE users_t
  ALTER COLUMN dept_id TYPE integer
  USING (CASE WHEN btrim(COALESCE(dept_id, '')) ~ '^[0-9]+$'
              THEN btrim(dept_id)::integer END);

-- An id that names no master row cannot become a foreign key; blank it instead
-- of letting ADD CONSTRAINT fail on a database that had stray values.
UPDATE users_t SET location_id = NULL
 WHERE location_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM main_office_master_t m WHERE m.id = users_t.location_id);

UPDATE users_t SET dept_id = NULL
 WHERE dept_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM department_master_t d WHERE d.id = users_t.dept_id);

-- ON DELETE SET NULL, not RESTRICT: retiring an office must not make its staff
-- unsaveable, and a user with no office is a valid state (the column is
-- nullable). The account outlives the posting.
ALTER TABLE users_t
  ADD CONSTRAINT users_t_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES main_office_master_t(id) ON DELETE SET NULL;

ALTER TABLE users_t
  ADD CONSTRAINT users_t_dept_id_fkey
  FOREIGN KEY (dept_id) REFERENCES department_master_t(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_t_location ON users_t (location_id);
CREATE INDEX IF NOT EXISTS idx_users_t_dept ON users_t (dept_id);
