-- Weight limits per Type of Goods (Masters → Type of Goods → "Weight limits apply").
--
-- For most goods an import file is held to two weight caps:
--   * the files on a licence can't together weigh more than the licence
--     (NEW — until now the form only displayed Remaining Weight), and
--   * a file can't weigh more than what is left on its inspection report
--     (PARTIELLE), whose allotments can't total more than the licence.
--
-- DIVERS is the exception: its licence may carry no weight at all (0), so files
-- may total more than it and a file may weigh more than its inspection report.
-- Allotments are still held to the licence weight when it has one.
--
-- A master flag rather than a hardcoded name (§4.1): another type can be
-- switched the same way without a deploy. The guards are in
-- src/db/queries/partielle.ts.

ALTER TABLE "type_of_goods_master_t"
  ADD COLUMN IF NOT EXISTS "weight_limited" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

UPDATE "type_of_goods_master_t"
SET "weight_limited" = false, "updated_at" = now()
WHERE upper(trim("goods_type")) = 'DIVERS' AND "weight_limited" = true;
