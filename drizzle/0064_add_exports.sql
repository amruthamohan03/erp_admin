-- exports_t (Export Tracking stage, §2). Hand-written to match the source MySQL
-- dump (exports_t). Conversions: int UNSIGNED -> integer, decimal -> numeric,
-- char(1) -> varchar(1), ON UPDATE timestamp dropped (handled by the app).
-- The source had logical FKs as plain indexes; here every FK column gets a real
-- REFERENCES constraint ("all possible foreign keys"). Business NOT NULLs are
-- relaxed to nullable for the §4.12 per-accordion create flow (enforced via field
-- `required`). mca_ref uses a PARTIAL unique so blank/in-progress rows are allowed.
-- feet_container holds the feet_container_master_t id (the controller joins it as
-- such), so it is modelled as an integer FK rather than the source varchar(50).

-- ===== exports_t =====
CREATE TABLE IF NOT EXISTS "exports_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer REFERENCES "clients_t"("id"),
  "license_id" integer REFERENCES "licenses_t"("id"),
  "kind" integer REFERENCES "kind_master_t"("id"),
  "type_of_goods" integer REFERENCES "type_of_goods_master_t"("id"),
  "transport_mode" integer REFERENCES "transport_mode_master_t"("id"),
  "mca_ref" varchar(100),
  "currency" integer REFERENCES "currency_master_t"("id"),
  "buyer" varchar(255),
  "regime" integer REFERENCES "regime_master_t"("id"),
  "types_of_clearance" integer REFERENCES "clearance_master_t"("id"),
  "invoice" varchar(100),
  "po_ref" varchar(100),
  "bp_no" varchar(100),
  "weight" numeric(10,3),
  "fob" numeric(15,2),
  "number_of_bags" integer,
  "lot_number" varchar(100),
  "horse" varchar(50),
  "trailer_1" varchar(50),
  "trailer_2" varchar(50),
  "feet_container" integer REFERENCES "feet_container_master_t"("id"),
  "wagon_ref" varchar(50),
  "container" varchar(50),
  "transporter" varchar(255),
  "site_of_loading_id" integer REFERENCES "transit_point_master_t"("id"),
  "destination" varchar(255),
  "exit_point_id" integer REFERENCES "transit_point_master_t"("id"),
  "dgda_seal_no" varchar(255),
  "number_of_seals" integer,
  "ceec_amount" numeric(10,2),
  "cgea_amount" numeric(10,2),
  "occ_amount" numeric(10,2),
  "lmc_amount" numeric(10,2),
  "ogefrem_amount" numeric(10,2),
  "loading_date" date,
  "pv_date" date,
  "bp_date" date,
  "demande_attestation_date" date,
  "assay_date" date,
  "archive_reference" varchar(255),
  "ceec_in_date" date,
  "ceec_out_date" date,
  "min_div_in_date" date,
  "min_div_out_date" date,
  "cgea_doc_ref" varchar(100),
  "segues_rcv_ref" varchar(100),
  "segues_payment_date" date,
  "document_status" integer REFERENCES "document_status_master_t"("id"),
  "customs_clearing_code" varchar(100),
  "dgda_in_date" date,
  "declaration_reference" varchar(100),
  "liquidation_reference" varchar(100),
  "liquidation_date" date,
  "liquidation_paid_by" varchar(100),
  "liquidation_amount" numeric(15,2),
  "quittance_reference" varchar(100),
  "quittance_date" date,
  "dgda_out_date" date,
  "gov_docs_in_date" date,
  "gov_docs_out_date" date,
  "dispatch_deliver_date" date,
  "kanyaka_arrival_date" date,
  "kanyaka_departure_date" date,
  "border_arrival_date" date,
  "exit_drc_date" date,
  "end_of_formalities_date" date,
  "truck_status" integer REFERENCES "truck_status_master_t"("id"),
  "lmc_id" varchar(100),
  "ogefrem_inv_ref" varchar(100),
  "loading_to_dispatch_date" date,
  "lmc_date" date,
  "ogefrem_date" date,
  "audited_date" date,
  "archived_date" date,
  "clearing_status" integer REFERENCES "clearing_status_master_t"("id"),
  "remarks" text,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id"),
  "updated_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_exports_t_mca_ref" ON "exports_t" ("mca_ref") WHERE "mca_ref" IS NOT NULL AND "mca_ref" <> '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exports_t_client" ON "exports_t" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exports_t_license" ON "exports_t" ("license_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exports_t_clearing_status" ON "exports_t" ("clearing_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exports_t_loading_date" ON "exports_t" ("loading_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exports_t_display" ON "exports_t" ("display");
