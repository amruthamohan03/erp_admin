-- 0062 — §4.1: which kinds an Import or an Export may use becomes configuration.
--
-- The `?group=import` / `?group=export` filter classified kinds by NAME PREFIX
-- (`kind_name ILIKE 'EXPORT%'`). Two things were wrong with that:
--
--   1. A kind whose name does not start with the word could never belong to the
--      group. IMPORT TEMPORARY is an export kind — goods brought in temporarily
--      leave again as a re-export, which is exactly why the MCA generator has a
--      "kind 2 prints RE" rule — but no amount of configuration could say so.
--   2. Renaming a kind silently reclassified it. "EXPORT DEFINITVE" corrected to
--      "Definitive Export" would have dropped out of every export form.
--
-- Two flags instead, so the answer is a row edit under Masters → Kind rather
-- than a deploy (§10: a type classification belongs in a master table).

ALTER TABLE "kind_master_t"
  ADD COLUMN IF NOT EXISTS "use_for_import" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "use_for_export" boolean NOT NULL DEFAULT false;

-- Backfill to exactly what the name-prefix filter already produced, so nothing
-- an operator sees changes on the strength of this migration alone.
UPDATE "kind_master_t" SET "use_for_import" = true WHERE "kind_name" ILIKE 'IMPORT%';
UPDATE "kind_master_t" SET "use_for_export" = true WHERE "kind_name" ILIKE 'EXPORT%';

-- …and then the one deliberate addition: a temporary import is re-exported, so
-- Export Tracking must be able to carry that kind. Matched by short code rather
-- than by id — ids are assigned by the seed and differ between installations.
--
-- The legacy screen also admitted UNDER VALUE and HAND CARRY to exports
-- (kind_id IN (2,3,4,5,6)). Those are deliberately NOT enabled here: they were
-- not asked for, and enabling one is now a toggle on the Kind master rather than
-- another migration.
UPDATE "kind_master_t"
   SET "use_for_export" = true,
       "updated_at" = now()
 WHERE upper(btrim("kind_short_name")) = 'IT';
