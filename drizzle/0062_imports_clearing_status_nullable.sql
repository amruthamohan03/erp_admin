-- Fix: imports_t.clearing_status was NOT NULL DEFAULT 1, but the §4.12 runtime
-- creates an import row from the 'basic' accordion, which doesn't set
-- clearing_status. Postgres then applied DEFAULT 1, and unless
-- clearing_status_master_t happens to have id=1 that INSERT fails the FK
-- (imports_t_clearing_status_fkey). Make it nullable with no default, consistent
-- with the other business FKs on imports_t (see the schema header). The Status
-- accordion's `required` flag still enforces a real value before completion.

ALTER TABLE "imports_t" ALTER COLUMN "clearing_status" DROP DEFAULT;
ALTER TABLE "imports_t" ALTER COLUMN "clearing_status" DROP NOT NULL;
