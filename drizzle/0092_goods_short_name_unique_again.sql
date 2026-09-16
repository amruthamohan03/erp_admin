-- Type of Goods — Short Name is unique again, alongside Type.
--
-- The history of this constraint, so the next person does not have to
-- reconstruct it from three migrations:
--   0085  unique on goods_short_name
--   0091  moved it to goods_type ("instead type"), releasing short name, and
--         dropped an UNTRACKED index that had been enforcing goods_type in this
--         database only
--   0092  this — short name unique again, so BOTH columns are now constrained
--
-- Both is the defensible end state. They are different kinds of duplicate:
--   * goods_type is what an operator reads in a dropdown, so two rows sharing
--     one are indistinguishable on screen;
--   * goods_short_name is the `goods` segment of every generated MCA reference
--     (§4.33 — NMI-ID**CO**R26-0001), so two rows sharing one make the code in a
--     reference ambiguous and put both types on a single numbering series.
-- Neither subsumes the other.

-- Same shape as the Type index: case- and whitespace-insensitive, because " co "
-- reaching the reference generator as "CO" is exactly the collision this
-- prevents; partial on display = 'Y' so a retired code is reusable (§4.27).
--
-- Deliberately the opposite choice from the MCA reference index itself, which
-- covers soft-deleted rows: a spent REFERENCE names one consignment and stays
-- spent, while a retired CODE is free for the next goods type to take.
CREATE UNIQUE INDEX IF NOT EXISTS "type_of_goods_master_t_short_name_uq"
  ON "type_of_goods_master_t" (UPPER(BTRIM("goods_short_name")))
  WHERE "display" = 'Y';
