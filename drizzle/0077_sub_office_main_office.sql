-- 0077 — a declaration office belongs to a main office (§4.1).
--
-- `sub_office_master_t` is the customs declaration desk; `main_office_master_t`
-- is the regional office it sits under (LUBUMBASHI, KOLWEZI, KASUMBALESA,
-- LIKASI, KINSHASA). The hierarchy was already stated in the schema comment and
-- in the page's own subtitle, but nothing recorded it: the two masters were
-- unrelated tables, so no screen could show which region a desk reports to and
-- no query could group declarations by region.
--
-- Nullable rather than NOT NULL. The table is empty today, so a NOT NULL would
-- be safe here and unsafe on any deployment that already has desks on file —
-- it would refuse the migration outright with no way to answer for the existing
-- rows. Nullable lets the column be filled in from the screen; make it required
-- once every desk names its office.
ALTER TABLE sub_office_master_t
  ADD COLUMN IF NOT EXISTS main_office_id integer;

-- ON DELETE SET NULL, not CASCADE: retiring a regional office must never delete
-- the declaration desks under it, and those desks are named by imports_t /
-- exports_t through declaration_office_id. Orphaning the link is recoverable,
-- destroying the desk is not (§4.27).
ALTER TABLE sub_office_master_t
  ADD CONSTRAINT sub_office_master_t_main_office_id_fkey
  FOREIGN KEY (main_office_id) REFERENCES main_office_master_t(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sub_office_master_t_main_office
  ON sub_office_master_t (main_office_id);
