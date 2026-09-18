-- §2 step 5 — the columns main's invoice screens capture and this schema did not.
--
-- Export invoice (exportinvoice.php):
--   * payment_mode  — "Mode de paiement", defaulting to CREDIT as main's select
--                     does. The value DGI is told the invoice is settled by.
--   * live_bcc_rate — the BCC CDF/USD rate on the invoice date, pre-filled from
--                     dgi_currency_rate_t and editable. Not the same number as
--                     each MCA row's DGDA rate (export_invoice_mca_details_t.bcc_rate).
--   * cmta … cmth   — comments A–H, printed on the facture.
--
-- Import invoice (importinvoice.php): comments A–H.
--
-- exports_t: the "held back from the pending-for-invoicing export" flag and its
-- reason. imports_t already carries the pair; main's export module used the same
-- two columns on its export table.
--
-- Every new column is nullable or defaulted, and both invoice tables are empty
-- in every environment this ships to, so no backfill is needed.
ALTER TABLE "export_invoices_t"
  ADD COLUMN IF NOT EXISTS "payment_mode"  varchar(30) NOT NULL DEFAULT 'CREDIT',
  ADD COLUMN IF NOT EXISTS "live_bcc_rate" numeric(18, 4),
  ADD COLUMN IF NOT EXISTS "cmta" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmtb" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmtc" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmtd" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmte" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmtf" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmtg" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmth" varchar(100);
--> statement-breakpoint

ALTER TABLE "import_invoices_t"
  ADD COLUMN IF NOT EXISTS "cmta" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmtb" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmtc" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmtd" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmte" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmtf" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmtg" varchar(100),
  ADD COLUMN IF NOT EXISTS "cmth" varchar(100);
--> statement-breakpoint

ALTER TABLE "exports_t"
  ADD COLUMN IF NOT EXISTS "inv_export_disabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "inv_export_disabled_remark" varchar(500);
