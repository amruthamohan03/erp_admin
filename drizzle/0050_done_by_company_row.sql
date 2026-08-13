-- 0050 — the "done by" row that means US renders as the configured project name.
--
-- done_by_master_t answers "who did this": the client, or the operating company.
-- The second row was seeded as the literal 'Malabar', which surfaced in every
-- Liquidation Paid By / License Cleared By / License Submitted To Bank dropdown
-- and made the deployment's own identity a database string no setting could
-- change. Marking the row instead lets its label resolve from
-- application_settings_master_t.project_name at read time (§4.1).
--
-- The stored `done_by_name` is left as-is: it is the historical value, it keeps
-- the unique index meaningful, and nothing reads it for display once the flag is
-- set. Renaming the project renames the option, with no data change.

ALTER TABLE "done_by_master_t"
  ADD COLUMN IF NOT EXISTS "is_company" boolean NOT NULL DEFAULT false;

-- Two rows claiming to be the company would make the resolved label ambiguous.
-- Unique over the constant column value, restricted to the rows that set it.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_done_by_master_t_is_company"
  ON "done_by_master_t" ("is_company")
  WHERE "is_company";

-- Mark the company row. Both statements are guarded on "no row claims it yet",
-- so they cannot fire twice, cannot fight each other, and cannot override a
-- choice an operator already made on /masters/done-by.
--
-- First by name: the seed ships 'Malabar', and deployments have renamed it to
-- generic labels while trying to solve exactly this problem.
UPDATE "done_by_master_t"
   SET "is_company" = true
 WHERE lower("done_by_name") IN ('malabar', 'malabar rdc sarl', 'company', 'us', 'self')
   AND "display" = 'Y'
   AND NOT EXISTS (SELECT 1 FROM "done_by_master_t" WHERE "is_company");

-- Then structurally: the catalogue answers "the client, or us", so when there
-- are exactly two live rows and one is the client, the other is us — whatever it
-- has been renamed to. Deliberately narrow: with a third row (an agent, a broker)
-- the answer is ambiguous and the operator picks it in the UI instead.
UPDATE "done_by_master_t"
   SET "is_company" = true
 WHERE "display" = 'Y'
   AND lower("done_by_name") <> 'client'
   AND (SELECT count(*) FROM "done_by_master_t" WHERE "display" = 'Y') = 2
   AND EXISTS (SELECT 1 FROM "done_by_master_t" WHERE lower("done_by_name") = 'client' AND "display" = 'Y')
   AND NOT EXISTS (SELECT 1 FROM "done_by_master_t" WHERE "is_company");
