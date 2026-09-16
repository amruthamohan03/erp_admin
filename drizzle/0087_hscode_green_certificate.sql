-- HS Code — the Green Certificate flag, and a soft-delete fix.
--
-- 1. Green Certificate
-- --------------------
-- Some tariff lines cannot clear without a *certificat vert* — the environmental
-- clearance DRC requires for particular goods. Whether a code needs one is a
-- property of the code, so it belongs on the code (§4.1) rather than being
-- remembered by whoever files the declaration.
--
-- boolean, not the varchar(1) 'Y'/'N' this codebase uses for `display`: those
-- carry three states (Y, N, and NULL-meaning-unset) and this has two. The newer
-- masters — expense_type_master_t.is_import, kind_master_t.use_for_import — are
-- already real booleans and this follows them. NOT NULL DEFAULT false so every
-- existing row answers the question rather than leaving the form to guess.
ALTER TABLE "hscode_master_t"
  ADD COLUMN IF NOT EXISTS "requires_green_certificate" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- 2. Soft delete permanently burned the code number
-- -------------------------------------------------
-- `uq_hscode_master_t_hscode_number_ci` covers EVERY row regardless of `display`,
-- so deleting an HS code (which only sets display = 'N', §4.27) left its number
-- unusable for good — re-adding 8517.12.00 after deleting it failed with 23505
-- and no way forward but a database edit.
--
-- An HS code is an entry in an external standard, not a locally-issued code: the
-- number keeps existing in the world after someone hides the row, and they must
-- be able to put it back. Partial on display = 'Y' fixes that, the same way
-- migration 0075 fixed it for the bank exchange rate board.
--
-- This is the OPPOSITE of the MCA reference index (§4.33), deliberately: a spent
-- reference stays spent because it names one consignment, while a tariff line is
-- a fact about the tariff.
DROP INDEX IF EXISTS "uq_hscode_master_t_hscode_number_ci";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_hscode_master_t_hscode_number_ci"
  ON "hscode_master_t" (LOWER(BTRIM("hscode_number")))
  WHERE "display" = 'Y';
