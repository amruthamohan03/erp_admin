-- Border-post configuration for the Import Tracking dashboard's overstay rule.
--
-- The rule is: a truck that has entered the DRC at a border post must be
-- dispatched from the border within N working days (Sat/Sun and the DRC holiday
-- master excluded). Main's dashboard hardcoded both halves -- the three posts as
-- `entry_point_id IN (8, 9, 10)` and the limit as a literal 3 in two places --
-- so opening a fourth post, or agreeing a different limit with the customs
-- office, meant editing source. Both are master data now (§4.1).
--
-- `border_post` joins the six capability flags the master already carries, so it
-- is edited on the same screen with the same toggle and filtered by the same
-- `capability` parameter.

ALTER TABLE transit_point_master_t
  ADD COLUMN IF NOT EXISTS border_post boolean NOT NULL DEFAULT false;

-- NOT NULL with a default rather than nullable-with-a-fallback: a post that is
-- subject to the rule always has a limit, and a COALESCE in the query would put
-- the real default somewhere no operator can see it.
ALTER TABLE transit_point_master_t
  ADD COLUMN IF NOT EXISTS border_max_working_days integer NOT NULL DEFAULT 3;

ALTER TABLE transit_point_master_t
  DROP CONSTRAINT IF EXISTS transit_point_master_t_border_days_check;
ALTER TABLE transit_point_master_t
  ADD CONSTRAINT transit_point_master_t_border_days_check
  CHECK (border_max_working_days BETWEEN 0 AND 365);

-- The three posts main's dashboard tracked, matched by name so this lands on
-- the ids the live database actually gave them.
UPDATE transit_point_master_t
   SET border_post = true
 WHERE upper(trim(transit_point_name)) IN ('KASUMBALESA', 'SAKANIA', 'MOKAMBO');
