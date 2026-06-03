-- Import-tracking masters + imports_t (Import Tracking stage, §2).
-- Hand-written to match the source MySQL dump. Conversions: bigint->serial (int),
-- subscriber_id->client_id, decimal->numeric, tinyint(1)->boolean, enum->varchar,
-- ON UPDATE timestamp dropped (handled by the app). Business NOT NULLs relaxed to
-- nullable for the §4.12 per-accordion create flow (enforced via field `required`).

-- ===== partial_t (minimal id+name master) =====
CREATE TABLE IF NOT EXISTS "partial_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "partial_name" varchar(150) NOT NULL,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id"),
  "updated_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ===== sub_office_master_t (minimal id+name master) =====
CREATE TABLE IF NOT EXISTS "sub_office_master_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "sub_office_name" varchar(255) NOT NULL,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id"),
  "updated_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ===== imports_t =====
CREATE TABLE IF NOT EXISTS "imports_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer REFERENCES "clients_t"("id"),
  "license_id" integer REFERENCES "licenses_t"("id"),
  "partial_id" integer REFERENCES "partial_t"("id"),
  "kind" integer REFERENCES "kind_master_t"("id"),
  "type_of_goods" integer REFERENCES "type_of_goods_master_t"("id"),
  "transport_mode" integer REFERENCES "transport_mode_master_t"("id"),
  "mca_ref" varchar(100),
  "currency" integer REFERENCES "currency_master_t"("id"),
  "license_invoice_number" varchar(100),
  "supplier" varchar(255),
  "regime" integer REFERENCES "regime_master_t"("id"),
  "types_of_clearance" integer REFERENCES "clearance_master_t"("id"),
  "declaration_office_id" integer REFERENCES "sub_office_master_t"("id"),
  "pre_alert_date" date,
  "invoice" varchar(100),
  "commodity" integer REFERENCES "commodity_master_t"("id"),
  "po_ref" varchar(100),
  "fret" numeric(15,2),
  "fret_currency" integer REFERENCES "currency_master_t"("id"),
  "other_charges" numeric(15,2),
  "other_charges_currency" integer REFERENCES "currency_master_t"("id"),
  "weight" numeric(15,2),
  "rem_weight" numeric(15,2),
  "m3" numeric(10,2),
  "cession_date" date,
  "fob" numeric(15,2),
  "r_fob" numeric(15,2),
  "r_fob_currency" integer REFERENCES "currency_master_t"("id"),
  "fob_currency" integer REFERENCES "currency_master_t"("id"),
  "insurance_date" date,
  "insurance_amount" numeric(15,2),
  "insurance_amount_currency" integer REFERENCES "currency_master_t"("id"),
  "insurance_reference" varchar(100),
  "crf_reference" varchar(100),
  "crf_received_date" date,
  "clearing_based_on" varchar(50),
  "ad_date" date,
  "inspection_reports" varchar(100),
  "archive_reference" varchar(100),
  "audited_date" date,
  "archived_date" date,
  "road_manif" varchar(100),
  "airway_bill" varchar(100),
  "container" varchar(100),
  "entry_point_id" integer REFERENCES "transit_point_master_t"("id"),
  "wagon" varchar(100),
  "airway_bill_weight" numeric(15,2),
  "horse" varchar(100),
  "trailer_1" varchar(100),
  "trailer_2" varchar(100),
  "dgda_in_date" date,
  "declaration_reference" varchar(100),
  "segues_rcv_ref" varchar(100),
  "segues_payment_date" date,
  "customs_manifest_number" varchar(100),
  "customs_manifest_date" date,
  "customs_clearance_code" varchar(100),
  "dgda_out_date" date,
  "document_status" integer DEFAULT 1 REFERENCES "document_status_master_t"("id"),
  "declaration_validity" varchar(50),
  "t1_number" varchar(100),
  "t1_date" date,
  "liquidation_reference" varchar(100),
  "liquidation_date" date,
  "liquidation_paid_by" varchar(100),
  "liquidation_amount" numeric(15,2),
  "quittance_reference" varchar(100),
  "quittance_date" date,
  "airport_arrival_date" date,
  "dispatch_from_airport" date,
  "operating_company" varchar(50),
  "operating_days" integer,
  "operating_amount" numeric(10,2),
  "arrival_date_zambia" date,
  "dispatch_from_zambia" date,
  "drc_entry_date" date,
  "border_warehouse_arrival_date" date,
  "dispatch_from_border" date,
  "kanyaka_arrival_date" date,
  "kanyaka_dispatch_date" date,
  "warehouse_arrival_date" date,
  "warehouse_departure_date" date,
  "dispatch_deliver_date" date,
  "ibs_coupon_reference" varchar(100),
  "border_warehouse_id" integer REFERENCES "transit_point_master_t"("id"),
  "entry_coupon" varchar(100),
  "bonded_warehouse_id" integer REFERENCES "transit_point_master_t"("id"),
  "truck_status" varchar(100),
  "clearing_status" integer NOT NULL DEFAULT 1 REFERENCES "clearing_status_master_t"("id"),
  "inv_export_disabled" boolean NOT NULL DEFAULT false,
  "inv_export_disabled_remark" varchar(500),
  "remarks" text,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id"),
  "updated_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_imports_t_mca_ref" ON "imports_t" ("mca_ref") WHERE "mca_ref" IS NOT NULL AND "mca_ref" <> '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_imports_t_client" ON "imports_t" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_imports_t_license" ON "imports_t" ("license_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_imports_t_clearing_status" ON "imports_t" ("clearing_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_imports_t_pre_alert_date" ON "imports_t" ("pre_alert_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_imports_t_display" ON "imports_t" ("display");
