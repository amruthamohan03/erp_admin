-- Extend quotation_category_master_t for the quotation page: a section header, an
-- explicit display order, and an is_customs flag (config, not name-matching) that
-- switches the section to CDF columns in Import-Definitive mode. Category 1 is
-- flagged customs by default (it carries the import-duty items); confirm/adjust
-- names, headers, order and the customs flag in /masters/quotation-categories.

ALTER TABLE "quotation_category_master_t"
  ADD COLUMN IF NOT EXISTS "category_header" varchar(255),
  ADD COLUMN IF NOT EXISTS "display_order" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "is_customs" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

UPDATE "quotation_category_master_t" SET
  "category_header" = COALESCE("category_header", "category_name"),
  "display_order"   = "id",
  "is_customs"      = ("id" = 1)
WHERE "id" IN (1, 2, 3, 4);
