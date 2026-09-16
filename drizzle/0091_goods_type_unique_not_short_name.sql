-- Type of Goods — the uniqueness belongs on TYPE, not on Short Name.
--
-- Migration 0085 put it on `goods_short_name`. That was the wrong column, and
-- the screen already said so: the form's live "Already exists" badge is wired to
-- the Type field (uniqueness registry entry `goods-types` → goodsType), while
-- Short Name has no indicator at all. So a duplicate short name was refused by
-- the database with no warning as the operator typed, and a duplicate TYPE was
-- warned about on screen and then accepted. Both halves were backwards.
--
-- 0085 is merged, so it is not edited (§7.2) — this corrects it.

-- Type is what an operator reads in every picker, so two rows sharing one is the
-- duplicate that actually confuses people. Case- and whitespace-insensitive for
-- the same reason as before: "Consumable" and "CONSUMABLE " are the same entry
-- as far as anyone reading a dropdown is concerned. Partial on display = 'Y' so
-- a soft-deleted row releases its name (§4.27).
CREATE UNIQUE INDEX IF NOT EXISTS "type_of_goods_master_t_type_uq"
  ON "type_of_goods_master_t" (UPPER(BTRIM("goods_type")))
  WHERE "display" = 'Y';
--> statement-breakpoint

-- An UNTRACKED index on the same column, dropped.
--
-- `uq_type_of_goods_master_t_goods_type_ci` exists in this database and in NO
-- migration — grep the whole of drizzle/ and src/ and it appears nowhere. It was
-- created by hand or by a `drizzle-kit push`, which is the §7.2 defect in its
-- pure form: the constraint is real here and absent from every other
-- environment, so "is Type unique?" has had two answers depending on which
-- database you asked.
--
-- It also behaves differently from the one above in a way that matters: it
-- covers EVERY row rather than only live ones, so soft-deleting a goods type
-- kept its name reserved for good (§4.27), and it does not trim, so
-- " CONSUMABLE " slipped past it. The tracked index replaces it on both counts.
DROP INDEX IF EXISTS "uq_type_of_goods_master_t_goods_type_ci";
--> statement-breakpoint

-- And Short Name is released.
--
-- Worth knowing what this gives up, because it is narrower than it sounds:
-- goods_short_name is the `goods` segment of every generated MCA reference
-- (§4.33 — NMI-ID**CO**R26-0001). Two goods types sharing "CO" do NOT produce
-- colliding references — the sequence still increments, because the counter is
-- scoped by exactly what the format prints. What is lost is distinguishability:
-- the two types become indistinguishable from the reference alone, and they
-- share one numbering series instead of having one each.
--
-- That is a reporting nuisance rather than a correctness failure, which is why
-- this drops as asked rather than pushing back. Restoring it is one migration if
-- it turns out to matter.
DROP INDEX IF EXISTS "type_of_goods_master_t_short_name_uq";
