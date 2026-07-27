-- Reconcile expense_type_master_t category flags with the Drizzle schema
-- (src/db/schema/expenseTypeMaster.ts), which declares is_import/is_export/
-- is_local/is_advance/is_other. The live table still carried main's bare
-- reserved-word names (import/export/local/advance/other); rename them so the
-- ORM projections (expenseTypeMaster.isImport, …) resolve.
ALTER TABLE expense_type_master_t RENAME COLUMN "import"  TO is_import;
ALTER TABLE expense_type_master_t RENAME COLUMN "export"  TO is_export;
ALTER TABLE expense_type_master_t RENAME COLUMN "local"   TO is_local;
ALTER TABLE expense_type_master_t RENAME COLUMN advance   TO is_advance;
ALTER TABLE expense_type_master_t RENAME COLUMN other     TO is_other;
