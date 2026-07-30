-- 0041 — bring the migration chain up to the shape the app (and the live
-- erp_admin DB) actually run on.
--
-- Background: the restructure branch's DB has been provisioned by restoring
-- main's dump + scripts/db-reconcile.sql, so a batch of tables/columns that
-- src/db/schema declares had never been captured as migrations. Everything
-- below was generated from the schema files by drizzle-kit and then made
-- idempotent (IF NOT EXISTS / IF EXISTS / FK-presence guard) so it is a no-op
-- on a dump-restored DB and still builds the full shape on a fresh
-- `pnpm db:migrate`.
--
-- New tables: master_page_t + master_page_accordion_t +
-- master_page_accordion_field_t + master_page_accordion_role_t +
-- master_page_accordion_field_role_t + master_bulk_filter_t (the §4.12
-- transaction-page config), main_office_master_t, office_location_master_t,
-- and the tables previously only shipped as drizzle/manual_*.sql
-- (partial_t, bivac_partial_t, drc_holidays_t, locals_t,
-- payment_stage_role_master_t, import_invoices_t + items,
-- export_invoices_t + items + mca details).

CREATE OR REPLACE FUNCTION pg_temp.add_fk_if_absent(p_table text, p_col text, p_stmt text) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class     t ON t.oid = c.conrelid AND t.relname = p_table
      JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = p_col
     WHERE c.contype = 'f' AND a.attnum = ANY (c.conkey)
  ) THEN
    EXECUTE p_stmt;
  END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bivac_partial_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"license_id" integer NOT NULL,
	"partial_name" varchar(255) NOT NULL,
	"client_id" integer,
	"partial_weight" numeric(15, 2) DEFAULT '0' NOT NULL,
	"partial_fob" numeric(15, 2) DEFAULT '0' NOT NULL,
	"partial_insurance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"partial_freight" numeric(15, 2) DEFAULT '0' NOT NULL,
	"partial_other_costs" numeric(15, 2) DEFAULT '0' NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drc_holidays_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"holiday_date" date NOT NULL,
	"name_en" varchar(150) NOT NULL,
	"name_fr" varchar(150),
	"holiday_type" varchar(20) DEFAULT 'fixed' NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "export_invoice_items_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"export_invoice_id" integer NOT NULL,
	"quotation_item_id" integer,
	"category_id" integer,
	"category_name" varchar(255),
	"category_header" varchar(255),
	"display_order" integer DEFAULT 999,
	"item_id" integer,
	"item_name" varchar(500),
	"unit_id" integer,
	"unit_text" varchar(100),
	"quantity" numeric(15, 3) DEFAULT '1',
	"taux_usd" numeric(15, 4) DEFAULT '0',
	"cost_usd" numeric(15, 4) DEFAULT '0',
	"currency_id" integer,
	"has_tva" integer DEFAULT 0,
	"tva_usd" numeric(15, 2) DEFAULT '0',
	"subtotal_usd" numeric(15, 2) DEFAULT '0',
	"total_usd" numeric(15, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "export_invoice_mca_details_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"export_invoice_id" integer NOT NULL,
	"mca_id" integer,
	"display_order" integer DEFAULT 0,
	"lot_number" varchar(255),
	"declaration_no" varchar(255),
	"declaration_date" date,
	"liquidation_no" varchar(255),
	"liquidation_date" date,
	"liquidation_amount" numeric(18, 2) DEFAULT '0',
	"liquidation_usd" numeric(15, 2) DEFAULT '0',
	"quittance_no" varchar(255),
	"quittance_date" date,
	"horse" varchar(100),
	"trailer_1" varchar(100),
	"trailer_2" varchar(100),
	"container" varchar(100),
	"feet_container_id" integer,
	"weight" numeric(15, 3) DEFAULT '0',
	"bcc_rate" numeric(15, 4) DEFAULT '0',
	"buyer" varchar(200),
	"ceec_amount" numeric(18, 2) DEFAULT '0',
	"cgea_amount" numeric(18, 2) DEFAULT '0',
	"occ_amount" numeric(18, 2) DEFAULT '0',
	"lmc_amount" numeric(18, 2) DEFAULT '0',
	"ogefrem_amount" numeric(18, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "export_invoices_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"license_id" integer,
	"kind_id" integer,
	"goods_type_id" integer,
	"transport_mode_id" integer,
	"invoice_ref" varchar(100),
	"invoice_date" date,
	"fob_usd" numeric(15, 2) DEFAULT '0',
	"total_weight" numeric(15, 3) DEFAULT '0',
	"total_duty_cdf" numeric(18, 2) DEFAULT '0',
	"quotation_id" integer,
	"quotation_sub_total" numeric(15, 2),
	"quotation_vat_amount" numeric(15, 2),
	"quotation_total_amount" numeric(15, 2),
	"arsp" varchar(20) DEFAULT 'Disabled',
	"dgi_code" varchar(100),
	"dgi_amount" numeric(15, 2) DEFAULT '0',
	"normalized_by" integer,
	"validated" integer DEFAULT 0 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_invoice_items_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"quotation_item_id" integer,
	"category_id" integer,
	"category_name" varchar(255),
	"category_header" varchar(255),
	"item_id" integer,
	"item_name" varchar(500),
	"item_description" text,
	"unit_id" integer,
	"unit_name" varchar(100),
	"unit_text" varchar(100),
	"quantity" numeric(15, 3) DEFAULT '1',
	"taux_usd" numeric(15, 4) DEFAULT '0',
	"cost_usd" numeric(15, 4) DEFAULT '0',
	"currency_id" integer,
	"currency_short_name" varchar(20),
	"has_tva" integer DEFAULT 0,
	"tva_usd" numeric(15, 2) DEFAULT '0',
	"subtotal_usd" numeric(15, 2) DEFAULT '0',
	"total_usd" numeric(15, 2) DEFAULT '0',
	"cif_split" numeric(18, 2) DEFAULT '0',
	"percentage" numeric(12, 4) DEFAULT '0',
	"rate_cdf" numeric(18, 2) DEFAULT '0',
	"vat_cdf" numeric(18, 2) DEFAULT '0',
	"total_cdf" numeric(18, 2) DEFAULT '0',
	"sort_order" integer DEFAULT 0,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_invoices_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"license_id" integer,
	"license_ids" varchar(255),
	"mca_id" integer,
	"mca_ids" varchar(500),
	"kind_id" integer,
	"goods_type_id" integer,
	"transport_mode_id" integer,
	"invoice_ref" varchar(100),
	"tally_ref" varchar(100),
	"dgi_amount" numeric(15, 2) DEFAULT '0',
	"normalized_by" integer,
	"payment_method" varchar(30) DEFAULT 'CREDIT',
	"fob_currency_id" integer,
	"fob_usd" numeric(15, 2) DEFAULT '0',
	"fret_currency_id" integer,
	"fret_usd" numeric(15, 2) DEFAULT '0',
	"assurance_currency_id" integer,
	"assurance_usd" numeric(15, 2) DEFAULT '0',
	"autres_charges_currency_id" integer,
	"autres_charges_usd" numeric(15, 2) DEFAULT '0',
	"rate_cdf_inv" numeric(15, 6) DEFAULT '2500',
	"rate_cdf_usd_bcc" numeric(15, 6) DEFAULT '2500',
	"rate_cdf_client34" numeric(15, 6),
	"cif_usd" numeric(15, 2) DEFAULT '0',
	"cif_cdf" numeric(18, 2) DEFAULT '0',
	"total_duty_cdf" numeric(18, 2) DEFAULT '0',
	"poids_kg" numeric(15, 2) DEFAULT '0',
	"m3" numeric(15, 2),
	"tariff_code_client" varchar(100),
	"horse" varchar(100),
	"trailer_1" varchar(100),
	"trailer_2" varchar(100),
	"container" varchar(100),
	"wagon" varchar(100),
	"airway_bill" varchar(100),
	"airway_bill_weight" numeric(15, 2),
	"facture_pfi_no" varchar(100),
	"po_ref" varchar(100),
	"bivac_inspection" varchar(100),
	"produit" varchar(255),
	"exoneration_code" varchar(100),
	"declaration_no" varchar(100),
	"declaration_date" date,
	"liquidation_no" varchar(100),
	"liquidation_date" date,
	"quittance_no" varchar(100),
	"quittance_date" date,
	"dispatch_deliver_date" date,
	"bank_id" integer,
	"quotation_id" integer,
	"quotation_sub_total" numeric(15, 2),
	"quotation_vat_amount" numeric(15, 2),
	"quotation_total_amount" numeric(15, 2),
	"calculated_sub_total" numeric(15, 2) DEFAULT '0',
	"calculated_vat_amount" numeric(15, 2) DEFAULT '0',
	"calculated_total_amount" numeric(15, 2) DEFAULT '0',
	"calculated_total_cdf" numeric(18, 2) DEFAULT '0',
	"items_manually_edited" integer DEFAULT 0,
	"first_categoty_edited" varchar(1) DEFAULT 'H',
	"invoice_template" varchar(5),
	"arsp" varchar(20) DEFAULT 'Disabled',
	"hidden_categories" text DEFAULT '[]',
	"is_debited" integer DEFAULT 0,
	"is_invoiced" integer DEFAULT 0,
	"validated" integer DEFAULT 0 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "locals_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"location" integer,
	"mca_lt_reference" varchar(100),
	"lot_num" varchar(100),
	"horse" varchar(100),
	"trailer_1" varchar(100),
	"trailer_2" varchar(100),
	"transporter" varchar(100),
	"nbr_of_bags" integer,
	"weight" numeric(12, 2),
	"arrival_date" date,
	"loading_date" date,
	"bp_details_received_date" date,
	"pv_div_mines_date" date,
	"demande_attestation_date" date,
	"ceec_in" date,
	"ceec_out" date,
	"cgea" varchar(100),
	"gov_docs_complete_date" date,
	"disp_date" date,
	"end_of_formalities" date,
	"remarks" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main_office_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"main_location_name" varchar(255),
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "master_bulk_filter_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_slug" varchar(100) NOT NULL,
	"filter_key" varchar(100) NOT NULL,
	"label" varchar(255) NOT NULL,
	"predicate" jsonb NOT NULL,
	"editable_fields" jsonb NOT NULL,
	"display_order" integer DEFAULT 1 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "master_page_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title" varchar(200) NOT NULL,
	"route" varchar(200) NOT NULL,
	"target_table" varchar(100) NOT NULL,
	"display_order" integer DEFAULT 1 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "master_page_accordion_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title" varchar(200) NOT NULL,
	"icon" varchar(100),
	"display_order" integer DEFAULT 1 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "master_page_accordion_field_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"accordion_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"label" varchar(255) NOT NULL,
	"field_type" varchar(30) NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"options_source" varchar(100),
	"options_label_field" varchar(100),
	"options_static" jsonb,
	"props" jsonb,
	"conditions" jsonb,
	"derive" jsonb,
	"display_order" integer DEFAULT 1 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "master_page_accordion_field_role_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"field_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"permission" varchar(10) NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "master_page_accordion_role_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"accordion_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"permission" varchar(10) NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "office_location_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_name" varchar(255) NOT NULL,
	"province_id" integer,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partial_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"partial_name" varchar(100) NOT NULL,
	"license_id" integer,
	"client_id" integer,
	"partial_weight" numeric(15, 3) DEFAULT '0' NOT NULL,
	"partial_fob" numeric(15, 2) DEFAULT '0' NOT NULL,
	"license_weight" numeric(15, 3),
	"license_fob" numeric(15, 2),
	"license_insurance" numeric(15, 2),
	"license_freight" numeric(15, 2),
	"license_other_costs" numeric(15, 2),
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_stage_role_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"stage" varchar(20) NOT NULL,
	"role_id" integer NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_master_t" DROP CONSTRAINT IF EXISTS "client_master_t_client_code_unique";
--> statement-breakpoint
ALTER TABLE "license_t" DROP CONSTRAINT IF EXISTS "license_t_license_no_unique";
--> statement-breakpoint
ALTER TABLE "payment_request_t" DROP CONSTRAINT IF EXISTS "payment_request_t_request_number_unique";
--> statement-breakpoint
ALTER TABLE "client_master_t" DROP CONSTRAINT IF EXISTS "client_master_t_office_location_id_office_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "client_master_t" DROP CONSTRAINT IF EXISTS "client_master_t_group_company_id_group_company_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "client_master_t" DROP CONSTRAINT IF EXISTS "client_master_t_industry_type_id_industry_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "client_master_t" DROP CONSTRAINT IF EXISTS "client_master_t_referred_by_id_referer_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "client_master_t" DROP CONSTRAINT IF EXISTS "client_master_t_phase_id_phase_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "license_t" DROP CONSTRAINT IF EXISTS "license_t_license_type_id_license_type_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "license_t" DROP CONSTRAINT IF EXISTS "license_t_approved_by_users_t_id_fk";
--> statement-breakpoint
ALTER TABLE "license_t" DROP CONSTRAINT IF EXISTS "license_t_client_id_client_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "license_t" DROP CONSTRAINT IF EXISTS "license_t_created_by_users_t_id_fk";
--> statement-breakpoint
ALTER TABLE "license_t" DROP CONSTRAINT IF EXISTS "license_t_updated_by_users_t_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_request_t" DROP CONSTRAINT IF EXISTS "payment_request_t_invoice_id_invoice_t_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_request_t" DROP CONSTRAINT IF EXISTS "payment_request_t_client_id_client_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "seal_batch_t" DROP CONSTRAINT IF EXISTS "seal_batch_t_office_location_id_office_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_kind_id_kind_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_type_of_goods_id_type_of_goods_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_transport_mode_id_transport_mode_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_currency_id_currency_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_regime_id_regime_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_types_of_clearance_id_clearance_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_commodity_id_commodity_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_hscode_id_hscode_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_incoterm_id_incoterm_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_fret_currency_id_currency_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_other_charges_currency_id_currency_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_r_fob_currency_id_currency_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_fob_currency_id_currency_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_insurance_amount_currency_id_currency_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_inspection_reports_file_id_files_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_document_status_id_document_status_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_clearing_status_id_clearing_status_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_client_id_client_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_license_id_license_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_partial_id_partial_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_declaration_office_id_sub_office_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_entry_point_id_transit_point_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_border_warehouse_id_transit_point_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_bonded_warehouse_id_transit_point_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_created_by_users_t_id_fk";
--> statement-breakpoint
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_updated_by_users_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_kind_id_kind_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_type_of_goods_id_type_of_goods_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_transport_mode_id_transport_mode_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_currency_id_currency_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_regime_id_regime_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_types_of_clearance_id_clearance_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_hscode_id_hscode_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_incoterm_id_incoterm_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_feet_container_id_feet_container_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_document_status_id_document_status_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_truck_status_id_truck_status_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_clearing_status_id_clearing_status_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_client_id_client_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_license_id_license_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_site_of_loading_id_transit_point_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_exit_point_id_transit_point_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_created_by_users_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_updated_by_users_t_id_fk";
--> statement-breakpoint
DROP INDEX "idx_imports_t_clearing_status";
--> statement-breakpoint
DROP INDEX "idx_exports_t_clearing_status";
--> statement-breakpoint
ALTER TABLE "client_master_t" ALTER COLUMN "client_type" SET DATA TYPE varchar(10);
--> statement-breakpoint
ALTER TABLE "client_master_t" ALTER COLUMN "client_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "client_master_t" ALTER COLUMN "phone" SET DATA TYPE varchar(20);
--> statement-breakpoint
ALTER TABLE "client_master_t" ALTER COLUMN "phone_secondary" SET DATA TYPE varchar(20);
--> statement-breakpoint
ALTER TABLE "client_master_t" ALTER COLUMN "payment_contact_phone" SET DATA TYPE varchar(20);
--> statement-breakpoint
ALTER TABLE "license_t" ALTER COLUMN "client_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ALTER COLUMN "amount" SET DATA TYPE numeric(15, 2);
--> statement-breakpoint
ALTER TABLE "payment_request_t" ALTER COLUMN "amount" SET DEFAULT '0';
--> statement-breakpoint
DO $$ BEGIN
  -- skeleton stored an ISO code here, main stores currency_master_t.id. Only
  -- runs on a migration-built DB (payment_request_t is empty there); a
  -- dump-restored DB already has the integer column and skips this.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'payment_request_t'
                AND column_name = 'currency' AND data_type <> 'integer') THEN
    ALTER TABLE "payment_request_t"
      ALTER COLUMN "currency" SET DATA TYPE integer USING NULLIF("currency", '')::integer;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ALTER COLUMN "currency" DROP NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  -- boolean -> 'Y'/'N' flag, matching main's shape.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'banklist_master_t'
                AND column_name = 'for_exchange' AND data_type = 'boolean') THEN
    ALTER TABLE "banklist_master_t" ALTER COLUMN "for_exchange" DROP DEFAULT;
    ALTER TABLE "banklist_master_t"
      ALTER COLUMN "for_exchange" SET DATA TYPE varchar(1)
      USING CASE WHEN "for_exchange" THEN 'Y' ELSE 'N' END;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "banklist_master_t" ALTER COLUMN "for_exchange" SET DEFAULT 'N';
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "company_name" varchar(200) NOT NULL;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "short_name" varchar(3) NOT NULL;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "payment_term" varchar(50);
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "credit_term" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "liquidation_paid_by" integer;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "license_cleared_by" integer;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "license_submit_to_bank" integer;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "contract_start_date" date;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "contract_validity" date;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "approval_code" varchar(50);
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "invoice_template" varchar(1) DEFAULT 'I' NOT NULL;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "verified_by_id" integer;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "verified_by_date" date;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "approved_by_id" integer;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "approved_by_date" date;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "remarks" text;
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "test" integer;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "license_number" varchar(50);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "bank_id" integer;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "license_cleared_by" integer;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "entry_post_id" integer;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "ref_cod" varchar(50);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "type_of_goods_id" integer;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "weight" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "m3" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "unit_of_measurement_id" integer;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "fob_declared" numeric(15, 2);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "insurance" numeric(15, 2);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "freight" numeric(15, 2);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "other_costs" numeric(15, 2);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "transport_mode_id" integer;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "invoice_number" varchar(50);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "invoice_file" varchar(255);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "invoice_date" date;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "currency_id" integer;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "supplier" varchar(255);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "license_applied_date" date;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "license_validation_date" date;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "license_expiry_date" date;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "license_file" varchar(255);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "kind_id" integer;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "payment_method_id" integer;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "payment_subtype_id" integer;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "destination_id" integer;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "fsi" varchar(100);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "aur" varchar(100);
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "fob_currency_id" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "insurance_currency_id" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "freight_currency_id" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "other_costs_currency_id" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "beneficiary" varchar(200);
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "requestee" varchar(200) NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "department" integer;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "location_id" integer;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "pay_for" smallint;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "payment_type" varchar(10);
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "expense_type" integer;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "motif" text;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "cash_collector" varchar(100);
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "mca_ref" varchar(255);
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "mca_data" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "chargeback" numeric(15, 2);
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "file1_path" varchar(500);
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "file2_path" varchar(500);
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "file3_path" varchar(500);
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "file4_path" varchar(500);
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "dept_approval" smallint;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "dept_approved_at" timestamp;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "dept_approved_by" integer;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "dept_notes" text;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "finance_approval" smallint;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "finance_approved_at" timestamp;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "finance_approved_by" integer;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "finance_notes" text;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "management_approval" smallint;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "management_approved_at" timestamp;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "management_approved_by" integer;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "management_notes" text;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "under_process" smallint;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "under_process_at" timestamp;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "under_process_by" integer;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "under_process_notes" text;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "paid_approval" smallint;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "paid_approved_at" timestamp;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "paid_approved_by" integer;
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD COLUMN IF NOT EXISTS "paid_notes" text;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "kind" integer;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "type_of_goods" integer;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "transport_mode" integer;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "currency" integer;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "regime" integer;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "types_of_clearance" integer;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "commodity" integer;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "fret_currency" integer;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "other_charges_currency" integer;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "r_fob_currency" integer;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "fob_currency" integer;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "insurance_amount_currency" integer;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "document_status" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "clearing_status" integer;
--> statement-breakpoint
ALTER TABLE "exports_t" ADD COLUMN IF NOT EXISTS "kind" integer;
--> statement-breakpoint
ALTER TABLE "exports_t" ADD COLUMN IF NOT EXISTS "type_of_goods" integer;
--> statement-breakpoint
ALTER TABLE "exports_t" ADD COLUMN IF NOT EXISTS "transport_mode" integer;
--> statement-breakpoint
ALTER TABLE "exports_t" ADD COLUMN IF NOT EXISTS "currency" integer;
--> statement-breakpoint
ALTER TABLE "exports_t" ADD COLUMN IF NOT EXISTS "regime" integer;
--> statement-breakpoint
ALTER TABLE "exports_t" ADD COLUMN IF NOT EXISTS "types_of_clearance" integer;
--> statement-breakpoint
ALTER TABLE "exports_t" ADD COLUMN IF NOT EXISTS "feet_container" integer;
--> statement-breakpoint
ALTER TABLE "exports_t" ADD COLUMN IF NOT EXISTS "document_status" integer;
--> statement-breakpoint
ALTER TABLE "exports_t" ADD COLUMN IF NOT EXISTS "truck_status" integer;
--> statement-breakpoint
ALTER TABLE "exports_t" ADD COLUMN IF NOT EXISTS "clearing_status" integer;
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('bivac_partial_t', 'license_id', 'ALTER TABLE "bivac_partial_t" ADD CONSTRAINT "bivac_partial_t_license_id_license_t_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."license_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('bivac_partial_t', 'client_id', 'ALTER TABLE "bivac_partial_t" ADD CONSTRAINT "bivac_partial_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('bivac_partial_t', 'created_by', 'ALTER TABLE "bivac_partial_t" ADD CONSTRAINT "bivac_partial_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('bivac_partial_t', 'updated_by', 'ALTER TABLE "bivac_partial_t" ADD CONSTRAINT "bivac_partial_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('drc_holidays_t', 'created_by', 'ALTER TABLE "drc_holidays_t" ADD CONSTRAINT "drc_holidays_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('drc_holidays_t', 'updated_by', 'ALTER TABLE "drc_holidays_t" ADD CONSTRAINT "drc_holidays_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('export_invoices_t', 'client_id', 'ALTER TABLE "export_invoices_t" ADD CONSTRAINT "export_invoices_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('export_invoices_t', 'license_id', 'ALTER TABLE "export_invoices_t" ADD CONSTRAINT "export_invoices_t_license_id_license_t_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."license_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('export_invoices_t', 'created_by', 'ALTER TABLE "export_invoices_t" ADD CONSTRAINT "export_invoices_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('export_invoices_t', 'updated_by', 'ALTER TABLE "export_invoices_t" ADD CONSTRAINT "export_invoices_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('import_invoice_items_t', 'created_by', 'ALTER TABLE "import_invoice_items_t" ADD CONSTRAINT "import_invoice_items_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('import_invoices_t', 'client_id', 'ALTER TABLE "import_invoices_t" ADD CONSTRAINT "import_invoices_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('import_invoices_t', 'created_by', 'ALTER TABLE "import_invoices_t" ADD CONSTRAINT "import_invoices_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('import_invoices_t', 'updated_by', 'ALTER TABLE "import_invoices_t" ADD CONSTRAINT "import_invoices_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('locals_t', 'client_id', 'ALTER TABLE "locals_t" ADD CONSTRAINT "locals_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('locals_t', 'location', 'ALTER TABLE "locals_t" ADD CONSTRAINT "locals_t_location_main_office_master_t_id_fk" FOREIGN KEY ("location") REFERENCES "public"."main_office_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('locals_t', 'created_by', 'ALTER TABLE "locals_t" ADD CONSTRAINT "locals_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('locals_t', 'updated_by', 'ALTER TABLE "locals_t" ADD CONSTRAINT "locals_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('main_office_master_t', 'created_by', 'ALTER TABLE "main_office_master_t" ADD CONSTRAINT "main_office_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('main_office_master_t', 'updated_by', 'ALTER TABLE "main_office_master_t" ADD CONSTRAINT "main_office_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_bulk_filter_t', 'created_by', 'ALTER TABLE "master_bulk_filter_t" ADD CONSTRAINT "master_bulk_filter_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_bulk_filter_t', 'updated_by', 'ALTER TABLE "master_bulk_filter_t" ADD CONSTRAINT "master_bulk_filter_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_t', 'created_by', 'ALTER TABLE "master_page_t" ADD CONSTRAINT "master_page_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_t', 'updated_by', 'ALTER TABLE "master_page_t" ADD CONSTRAINT "master_page_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_t', 'page_id', 'ALTER TABLE "master_page_accordion_t" ADD CONSTRAINT "master_page_accordion_t_page_id_master_page_t_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."master_page_t"("id") ON DELETE cascade ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_t', 'created_by', 'ALTER TABLE "master_page_accordion_t" ADD CONSTRAINT "master_page_accordion_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_t', 'updated_by', 'ALTER TABLE "master_page_accordion_t" ADD CONSTRAINT "master_page_accordion_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_field_t', 'accordion_id', 'ALTER TABLE "master_page_accordion_field_t" ADD CONSTRAINT "master_page_accordion_field_t_accordion_id_master_page_accordion_t_id_fk" FOREIGN KEY ("accordion_id") REFERENCES "public"."master_page_accordion_t"("id") ON DELETE cascade ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_field_t', 'created_by', 'ALTER TABLE "master_page_accordion_field_t" ADD CONSTRAINT "master_page_accordion_field_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_field_t', 'updated_by', 'ALTER TABLE "master_page_accordion_field_t" ADD CONSTRAINT "master_page_accordion_field_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_field_role_t', 'field_id', 'ALTER TABLE "master_page_accordion_field_role_t" ADD CONSTRAINT "master_page_accordion_field_role_t_field_id_master_page_accordion_field_t_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."master_page_accordion_field_t"("id") ON DELETE cascade ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_field_role_t', 'role_id', 'ALTER TABLE "master_page_accordion_field_role_t" ADD CONSTRAINT "master_page_accordion_field_role_t_role_id_role_master_t_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_master_t"("id") ON DELETE cascade ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_field_role_t', 'created_by', 'ALTER TABLE "master_page_accordion_field_role_t" ADD CONSTRAINT "master_page_accordion_field_role_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_field_role_t', 'updated_by', 'ALTER TABLE "master_page_accordion_field_role_t" ADD CONSTRAINT "master_page_accordion_field_role_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_role_t', 'accordion_id', 'ALTER TABLE "master_page_accordion_role_t" ADD CONSTRAINT "master_page_accordion_role_t_accordion_id_master_page_accordion_t_id_fk" FOREIGN KEY ("accordion_id") REFERENCES "public"."master_page_accordion_t"("id") ON DELETE cascade ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_role_t', 'role_id', 'ALTER TABLE "master_page_accordion_role_t" ADD CONSTRAINT "master_page_accordion_role_t_role_id_role_master_t_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_master_t"("id") ON DELETE cascade ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_role_t', 'created_by', 'ALTER TABLE "master_page_accordion_role_t" ADD CONSTRAINT "master_page_accordion_role_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('master_page_accordion_role_t', 'updated_by', 'ALTER TABLE "master_page_accordion_role_t" ADD CONSTRAINT "master_page_accordion_role_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('office_location_master_t', 'province_id', 'ALTER TABLE "office_location_master_t" ADD CONSTRAINT "office_location_master_t_province_id_province_master_t_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."province_master_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('office_location_master_t', 'created_by', 'ALTER TABLE "office_location_master_t" ADD CONSTRAINT "office_location_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('office_location_master_t', 'updated_by', 'ALTER TABLE "office_location_master_t" ADD CONSTRAINT "office_location_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('partial_t', 'license_id', 'ALTER TABLE "partial_t" ADD CONSTRAINT "partial_t_license_id_license_t_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."license_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('partial_t', 'client_id', 'ALTER TABLE "partial_t" ADD CONSTRAINT "partial_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('partial_t', 'created_by', 'ALTER TABLE "partial_t" ADD CONSTRAINT "partial_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('partial_t', 'updated_by', 'ALTER TABLE "partial_t" ADD CONSTRAINT "partial_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('payment_stage_role_master_t', 'role_id', 'ALTER TABLE "payment_stage_role_master_t" ADD CONSTRAINT "payment_stage_role_master_t_role_id_role_master_t_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('payment_stage_role_master_t', 'created_by', 'ALTER TABLE "payment_stage_role_master_t" ADD CONSTRAINT "payment_stage_role_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('payment_stage_role_master_t', 'updated_by', 'ALTER TABLE "payment_stage_role_master_t" ADD CONSTRAINT "payment_stage_role_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_bivac_partial_t_partial_name" ON "bivac_partial_t" USING btree ("partial_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bivac_partial_t_license" ON "bivac_partial_t" USING btree ("license_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bivac_partial_t_display" ON "bivac_partial_t" USING btree ("display");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drc_holidays_t_date" ON "drc_holidays_t" USING btree ("holiday_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eii_invoice" ON "export_invoice_items_t" USING btree ("export_invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eimd_invoice" ON "export_invoice_mca_details_t" USING btree ("export_invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eimd_mca" ON "export_invoice_mca_details_t" USING btree ("mca_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_export_invoices_t_client" ON "export_invoices_t" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_export_invoices_t_validated" ON "export_invoices_t" USING btree ("validated");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_export_invoices_t_created_by" ON "export_invoices_t" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_iii_invoice" ON "import_invoice_items_t" USING btree ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_invoices_t_client" ON "import_invoices_t" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_invoices_t_validated" ON "import_invoices_t" USING btree ("validated");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_invoices_t_created_by" ON "import_invoices_t" USING btree ("created_by");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_locals_t_mca_lt_reference" ON "locals_t" USING btree ("mca_lt_reference") WHERE "locals_t"."mca_lt_reference" IS NOT NULL AND "locals_t"."mca_lt_reference" <> '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_locals_t_client" ON "locals_t" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_locals_t_location" ON "locals_t" USING btree ("location");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_locals_t_display" ON "locals_t" USING btree ("display");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_master_bulk_filter_t_page_filter" ON "master_bulk_filter_t" USING btree ("page_slug","filter_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_master_page_t_slug" ON "master_page_t" USING btree ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_master_page_accordion_t_page_slug" ON "master_page_accordion_t" USING btree ("page_id","slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_master_page_accordion_field_t_acc_name" ON "master_page_accordion_field_t" USING btree ("accordion_id","name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_master_page_accordion_field_role_t" ON "master_page_accordion_field_role_t" USING btree ("field_id","role_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_master_page_accordion_role_t" ON "master_page_accordion_role_t" USING btree ("accordion_id","role_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_office_location_master_t_province" ON "office_location_master_t" USING btree ("province_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_partial_t_name" ON "partial_t" USING btree ("partial_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_partial_t_license" ON "partial_t" USING btree ("license_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_stage_role_t" ON "payment_stage_role_master_t" USING btree ("stage","role_id");
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('client_master_t', 'office_location_id', 'ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_office_location_id_office_location_master_t_id_fk" FOREIGN KEY ("office_location_id") REFERENCES "public"."office_location_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('client_master_t', 'liquidation_paid_by', 'ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_liquidation_paid_by_done_by_master_t_id_fk" FOREIGN KEY ("liquidation_paid_by") REFERENCES "public"."done_by_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('client_master_t', 'license_cleared_by', 'ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_license_cleared_by_done_by_master_t_id_fk" FOREIGN KEY ("license_cleared_by") REFERENCES "public"."done_by_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('client_master_t', 'license_submit_to_bank', 'ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_license_submit_to_bank_done_by_master_t_id_fk" FOREIGN KEY ("license_submit_to_bank") REFERENCES "public"."done_by_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('client_master_t', 'verified_by_id', 'ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_verified_by_id_users_t_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('client_master_t', 'approved_by_id', 'ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_approved_by_id_users_t_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('client_master_t', 'group_company_id', 'ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_group_company_id_group_company_master_t_id_fk" FOREIGN KEY ("group_company_id") REFERENCES "public"."group_company_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('client_master_t', 'industry_type_id', 'ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_industry_type_id_industry_master_t_id_fk" FOREIGN KEY ("industry_type_id") REFERENCES "public"."industry_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('client_master_t', 'referred_by_id', 'ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_referred_by_id_referer_master_t_id_fk" FOREIGN KEY ("referred_by_id") REFERENCES "public"."referer_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('client_master_t', 'phase_id', 'ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_phase_id_phase_master_t_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phase_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'bank_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_bank_id_banklist_master_t_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."banklist_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'license_cleared_by', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_license_cleared_by_done_by_master_t_id_fk" FOREIGN KEY ("license_cleared_by") REFERENCES "public"."done_by_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'entry_post_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_entry_post_id_transit_point_master_t_id_fk" FOREIGN KEY ("entry_post_id") REFERENCES "public"."transit_point_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'type_of_goods_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_type_of_goods_id_type_of_goods_master_t_id_fk" FOREIGN KEY ("type_of_goods_id") REFERENCES "public"."type_of_goods_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'unit_of_measurement_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_unit_of_measurement_id_unit_master_t_id_fk" FOREIGN KEY ("unit_of_measurement_id") REFERENCES "public"."unit_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'transport_mode_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_transport_mode_id_transport_mode_master_t_id_fk" FOREIGN KEY ("transport_mode_id") REFERENCES "public"."transport_mode_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'currency_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_currency_id_currency_master_t_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'kind_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_kind_id_kind_master_t_id_fk" FOREIGN KEY ("kind_id") REFERENCES "public"."kind_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'payment_method_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_payment_method_id_payment_type_master_t_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_type_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'payment_subtype_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_payment_subtype_id_payment_subtype_master_t_id_fk" FOREIGN KEY ("payment_subtype_id") REFERENCES "public"."payment_subtype_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'destination_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_destination_id_origin_master_t_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."origin_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'fob_currency_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_fob_currency_id_currency_master_t_id_fk" FOREIGN KEY ("fob_currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'insurance_currency_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_insurance_currency_id_currency_master_t_id_fk" FOREIGN KEY ("insurance_currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'freight_currency_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_freight_currency_id_currency_master_t_id_fk" FOREIGN KEY ("freight_currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'other_costs_currency_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_other_costs_currency_id_currency_master_t_id_fk" FOREIGN KEY ("other_costs_currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'client_id', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'created_by', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('license_t', 'updated_by', 'ALTER TABLE "license_t" ADD CONSTRAINT "license_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('payment_request_t', 'department', 'ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_department_department_master_t_id_fk" FOREIGN KEY ("department") REFERENCES "public"."department_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('payment_request_t', 'location_id', 'ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_location_id_main_office_master_t_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."main_office_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('payment_request_t', 'currency', 'ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_currency_currency_master_t_id_fk" FOREIGN KEY ("currency") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('payment_request_t', 'expense_type', 'ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_expense_type_expense_type_master_t_id_fk" FOREIGN KEY ("expense_type") REFERENCES "public"."expense_type_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('payment_request_t', 'dept_approved_by', 'ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_dept_approved_by_users_t_id_fk" FOREIGN KEY ("dept_approved_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('payment_request_t', 'finance_approved_by', 'ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_finance_approved_by_users_t_id_fk" FOREIGN KEY ("finance_approved_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('payment_request_t', 'management_approved_by', 'ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_management_approved_by_users_t_id_fk" FOREIGN KEY ("management_approved_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('payment_request_t', 'under_process_by', 'ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_under_process_by_users_t_id_fk" FOREIGN KEY ("under_process_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('payment_request_t', 'paid_approved_by', 'ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_paid_approved_by_users_t_id_fk" FOREIGN KEY ("paid_approved_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('payment_request_t', 'client_id', 'ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('seal_batch_t', 'office_location_id', 'ALTER TABLE "seal_batch_t" ADD CONSTRAINT "seal_batch_t_office_location_id_main_office_master_t_id_fk" FOREIGN KEY ("office_location_id") REFERENCES "public"."main_office_master_t"("id") ON DELETE restrict ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'kind', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_kind_kind_master_t_id_fk" FOREIGN KEY ("kind") REFERENCES "public"."kind_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'type_of_goods', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_type_of_goods_type_of_goods_master_t_id_fk" FOREIGN KEY ("type_of_goods") REFERENCES "public"."type_of_goods_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'transport_mode', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_transport_mode_transport_mode_master_t_id_fk" FOREIGN KEY ("transport_mode") REFERENCES "public"."transport_mode_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'currency', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_currency_currency_master_t_id_fk" FOREIGN KEY ("currency") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'regime', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_regime_regime_master_t_id_fk" FOREIGN KEY ("regime") REFERENCES "public"."regime_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'types_of_clearance', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_types_of_clearance_clearance_master_t_id_fk" FOREIGN KEY ("types_of_clearance") REFERENCES "public"."clearance_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'commodity', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_commodity_commodity_master_t_id_fk" FOREIGN KEY ("commodity") REFERENCES "public"."commodity_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'fret_currency', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_fret_currency_currency_master_t_id_fk" FOREIGN KEY ("fret_currency") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'other_charges_currency', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_other_charges_currency_currency_master_t_id_fk" FOREIGN KEY ("other_charges_currency") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'r_fob_currency', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_r_fob_currency_currency_master_t_id_fk" FOREIGN KEY ("r_fob_currency") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'fob_currency', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_fob_currency_currency_master_t_id_fk" FOREIGN KEY ("fob_currency") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'insurance_amount_currency', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_insurance_amount_currency_currency_master_t_id_fk" FOREIGN KEY ("insurance_amount_currency") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'document_status', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_document_status_document_status_master_t_id_fk" FOREIGN KEY ("document_status") REFERENCES "public"."document_status_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'clearing_status', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_clearing_status_clearing_status_master_t_id_fk" FOREIGN KEY ("clearing_status") REFERENCES "public"."clearing_status_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'client_id', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'license_id', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_license_id_license_t_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."license_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'partial_id', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_partial_id_partial_master_t_id_fk" FOREIGN KEY ("partial_id") REFERENCES "public"."partial_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'declaration_office_id', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_declaration_office_id_sub_office_master_t_id_fk" FOREIGN KEY ("declaration_office_id") REFERENCES "public"."sub_office_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'entry_point_id', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_entry_point_id_transit_point_master_t_id_fk" FOREIGN KEY ("entry_point_id") REFERENCES "public"."transit_point_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'border_warehouse_id', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_border_warehouse_id_transit_point_master_t_id_fk" FOREIGN KEY ("border_warehouse_id") REFERENCES "public"."transit_point_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'bonded_warehouse_id', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_bonded_warehouse_id_transit_point_master_t_id_fk" FOREIGN KEY ("bonded_warehouse_id") REFERENCES "public"."transit_point_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'created_by', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('imports_t', 'updated_by', 'ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'kind', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_kind_kind_master_t_id_fk" FOREIGN KEY ("kind") REFERENCES "public"."kind_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'type_of_goods', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_type_of_goods_type_of_goods_master_t_id_fk" FOREIGN KEY ("type_of_goods") REFERENCES "public"."type_of_goods_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'transport_mode', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_transport_mode_transport_mode_master_t_id_fk" FOREIGN KEY ("transport_mode") REFERENCES "public"."transport_mode_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'currency', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_currency_currency_master_t_id_fk" FOREIGN KEY ("currency") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'regime', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_regime_regime_master_t_id_fk" FOREIGN KEY ("regime") REFERENCES "public"."regime_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'types_of_clearance', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_types_of_clearance_clearance_master_t_id_fk" FOREIGN KEY ("types_of_clearance") REFERENCES "public"."clearance_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'feet_container', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_feet_container_feet_container_master_t_id_fk" FOREIGN KEY ("feet_container") REFERENCES "public"."feet_container_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'document_status', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_document_status_document_status_master_t_id_fk" FOREIGN KEY ("document_status") REFERENCES "public"."document_status_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'truck_status', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_truck_status_truck_status_master_t_id_fk" FOREIGN KEY ("truck_status") REFERENCES "public"."truck_status_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'clearing_status', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_clearing_status_clearing_status_master_t_id_fk" FOREIGN KEY ("clearing_status") REFERENCES "public"."clearing_status_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'client_id', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'license_id', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_license_id_license_t_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."license_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'site_of_loading_id', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_site_of_loading_id_transit_point_master_t_id_fk" FOREIGN KEY ("site_of_loading_id") REFERENCES "public"."transit_point_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'exit_point_id', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_exit_point_id_transit_point_master_t_id_fk" FOREIGN KEY ("exit_point_id") REFERENCES "public"."transit_point_master_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'created_by', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
SELECT pg_temp.add_fk_if_absent('exports_t', 'updated_by', 'ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_master_t_referred_by" ON "client_master_t" USING btree ("referred_by_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_master_t_display_company" ON "client_master_t" USING btree ("display","company_name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_license_t_license_number" ON "license_t" USING btree ("license_number") WHERE "license_t"."license_number" IS NOT NULL AND "license_t"."license_number" <> '';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_license_t_invoice_number" ON "license_t" USING btree ("invoice_number") WHERE "license_t"."invoice_number" IS NOT NULL AND "license_t"."invoice_number" <> '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_license_t_client" ON "license_t" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_license_t_kind" ON "license_t" USING btree ("kind_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_license_t_transport" ON "license_t" USING btree ("transport_mode_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_license_t_display_license" ON "license_t" USING btree ("display","license_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_request_t_created_by" ON "payment_request_t" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_request_t_location" ON "payment_request_t" USING btree ("location_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_request_t_type" ON "payment_request_t" USING btree ("payment_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_imports_t_clearing_status" ON "imports_t" USING btree ("clearing_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exports_t_clearing_status" ON "exports_t" USING btree ("clearing_status");
