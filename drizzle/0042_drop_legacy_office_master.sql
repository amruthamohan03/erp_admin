-- 0042 — retire the restructure-skeleton leftovers that main's shape replaced.
--
-- office_master_t was superseded by main_office_master_t (offices) plus
-- office_location_master_t (province-scoped locations), both created in 0041.
-- The dropped columns are the skeleton's *_id / state / name variants that the
-- schema files no longer declare — the live DB (restored from main) never had
-- them, so every statement here is guarded and is a no-op there.

DROP TABLE IF EXISTS "office_master_t" CASCADE;
--> statement-breakpoint
ALTER TABLE "client_master_t" DROP COLUMN IF EXISTS "client_code";
--> statement-breakpoint
ALTER TABLE "client_master_t" DROP COLUMN IF EXISTS "name";
--> statement-breakpoint
ALTER TABLE "client_master_t" DROP COLUMN IF EXISTS "legal_name";
--> statement-breakpoint
ALTER TABLE "client_master_t" DROP COLUMN IF EXISTS "tax_id";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP COLUMN IF EXISTS "kind_id";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP COLUMN IF EXISTS "type_of_goods_id";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP COLUMN IF EXISTS "transport_mode_id";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP COLUMN IF EXISTS "currency_id";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP COLUMN IF EXISTS "regime_id";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP COLUMN IF EXISTS "types_of_clearance_id";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP COLUMN IF EXISTS "hscode_id";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP COLUMN IF EXISTS "incoterm_id";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP COLUMN IF EXISTS "feet_container_id";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP COLUMN IF EXISTS "document_status_id";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP COLUMN IF EXISTS "truck_status_id";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP COLUMN IF EXISTS "clearing_status_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "kind_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "type_of_goods_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "transport_mode_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "currency_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "regime_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "types_of_clearance_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "commodity_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "hscode_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "incoterm_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "fret_currency_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "other_charges_currency_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "r_fob_currency_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "fob_currency_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "insurance_amount_currency_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "inspection_reports_file_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "document_status_id";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP COLUMN IF EXISTS "clearing_status_id";
--> statement-breakpoint
ALTER TABLE "license_t" DROP COLUMN IF EXISTS "license_no";
--> statement-breakpoint
ALTER TABLE "license_t" DROP COLUMN IF EXISTS "license_type_id";
--> statement-breakpoint
ALTER TABLE "license_t" DROP COLUMN IF EXISTS "state";
--> statement-breakpoint
ALTER TABLE "license_t" DROP COLUMN IF EXISTS "amount";
--> statement-breakpoint
ALTER TABLE "license_t" DROP COLUMN IF EXISTS "currency";
--> statement-breakpoint
ALTER TABLE "license_t" DROP COLUMN IF EXISTS "issue_date";
--> statement-breakpoint
ALTER TABLE "license_t" DROP COLUMN IF EXISTS "expiry_date";
--> statement-breakpoint
ALTER TABLE "license_t" DROP COLUMN IF EXISTS "approved_by";
--> statement-breakpoint
ALTER TABLE "license_t" DROP COLUMN IF EXISTS "approved_at";
--> statement-breakpoint
ALTER TABLE "license_t" DROP COLUMN IF EXISTS "notes";
--> statement-breakpoint
ALTER TABLE "payment_request_t" DROP COLUMN IF EXISTS "request_number";
--> statement-breakpoint
ALTER TABLE "payment_request_t" DROP COLUMN IF EXISTS "invoice_id";
--> statement-breakpoint
ALTER TABLE "payment_request_t" DROP COLUMN IF EXISTS "state";
--> statement-breakpoint
ALTER TABLE "payment_request_t" DROP COLUMN IF EXISTS "purpose";
--> statement-breakpoint
ALTER TABLE "payment_request_t" DROP COLUMN IF EXISTS "current_approval_level";
--> statement-breakpoint
ALTER TABLE "payment_request_t" DROP COLUMN IF EXISTS "approved_at";
--> statement-breakpoint
ALTER TABLE "payment_request_t" DROP COLUMN IF EXISTS "paid_at";
--> statement-breakpoint
ALTER TABLE "payment_request_t" DROP COLUMN IF EXISTS "due_date";
--> statement-breakpoint
ALTER TABLE "payment_request_t" DROP COLUMN IF EXISTS "notes";
