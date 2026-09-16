-- Type of Goods — the short name is a code, so it must identify exactly one row.
--
-- It feeds the generated references (§4.33: the `goods` segment is this code, so
-- NMI-IDCOR26-0001 carries "CO"). Two goods types sharing a code make the
-- reference ambiguous and, worse, make the sequence counter scope wrong — the
-- regex that finds the next number anchors on the other segments' resolved
-- values, so two types resolving to "CO" would share one numbering series.
--
-- UPPER(btrim(...)): a code is case- and whitespace-insensitive in practice, and
-- " co " reaching the reference generator as "CO" is exactly the collision this
-- prevents. A plain unique index would let "CO" and "co" both exist.
--
-- PARTIAL on display = 'Y' (§4.27): deleting a goods type hides it, and its code
-- must then be reusable. An index covering hidden rows would let a soft delete
-- permanently burn a two-letter code. This is the opposite choice from the MCA
-- reference index, deliberately: a spent *reference* stays spent, a retired
-- *code* is free again.
CREATE UNIQUE INDEX IF NOT EXISTS "type_of_goods_master_t_short_name_uq"
  ON "type_of_goods_master_t" (UPPER(btrim("goods_short_name")))
  WHERE "display" = 'Y';
