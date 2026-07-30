-- 0043 — bank_code is a free-text placeholder, not a key.
--
-- 0031 put a unique index on banklist_master_t.bank_code. Production has never
-- populated it — all 13 banks carry 'N/A' — so the index could not be applied
-- to the real database and blocked seeding the production bank list into a
-- migration-built one. Uniqueness moves to bank_name (case-insensitive), which
-- is what production already enforces.

DROP INDEX IF EXISTS "uq_banklist_master_t_bank_code";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_banklist_master_t_bank_name_ci" ON "banklist_master_t" USING btree (lower("bank_name"));
