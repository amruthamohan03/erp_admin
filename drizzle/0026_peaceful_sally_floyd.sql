CREATE TABLE "imports_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"license_id" integer,
	"partial_id" integer,
	"kind_id" integer,
	"type_of_goods_id" integer,
	"transport_mode_id" integer,
	"mca_ref" varchar(100),
	"currency_id" integer,
	"license_invoice_number" varchar(100),
	"supplier" varchar(255),
	"regime_id" integer,
	"types_of_clearance_id" integer,
	"declaration_office_id" integer,
	"pre_alert_date" date,
	"invoice" varchar(100),
	"commodity_id" integer,
	"po_ref" varchar(100),
	"fret" numeric(15, 2),
	"fret_currency_id" integer,
	"other_charges" numeric(15, 2),
	"other_charges_currency_id" integer,
	"weight" numeric(15, 2),
	"rem_weight" numeric(15, 2),
	"m3" numeric(10, 2),
	"cession_date" date,
	"fob" numeric(15, 2),
	"r_fob" numeric(15, 2),
	"r_fob_currency_id" integer,
	"fob_currency_id" integer,
	"insurance_date" date,
	"insurance_amount" numeric(15, 2),
	"insurance_amount_currency_id" integer,
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
	"entry_point_id" integer,
	"wagon" varchar(100),
	"airway_bill_weight" numeric(15, 2),
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
	"document_status_id" integer,
	"declaration_validity" varchar(50),
	"t1_number" varchar(100),
	"t1_date" date,
	"liquidation_reference" varchar(100),
	"liquidation_date" date,
	"liquidation_paid_by" varchar(100),
	"liquidation_amount" numeric(15, 2),
	"quittance_reference" varchar(100),
	"quittance_date" date,
	"airport_arrival_date" date,
	"dispatch_from_airport" date,
	"operating_company" varchar(50),
	"operating_days" integer,
	"operating_amount" numeric(10, 2),
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
	"border_warehouse_id" integer,
	"entry_coupon" varchar(100),
	"bonded_warehouse_id" integer,
	"truck_status" varchar(100),
	"clearing_status_id" integer,
	"inv_export_disabled" boolean DEFAULT false NOT NULL,
	"inv_export_disabled_remark" varchar(500),
	"remarks" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_license_id_license_t_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."license_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_partial_id_partial_master_t_id_fk" FOREIGN KEY ("partial_id") REFERENCES "public"."partial_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_kind_id_kind_master_t_id_fk" FOREIGN KEY ("kind_id") REFERENCES "public"."kind_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_type_of_goods_id_type_of_goods_master_t_id_fk" FOREIGN KEY ("type_of_goods_id") REFERENCES "public"."type_of_goods_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_transport_mode_id_transport_mode_master_t_id_fk" FOREIGN KEY ("transport_mode_id") REFERENCES "public"."transport_mode_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_currency_id_currency_master_t_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_regime_id_regime_master_t_id_fk" FOREIGN KEY ("regime_id") REFERENCES "public"."regime_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_types_of_clearance_id_clearance_master_t_id_fk" FOREIGN KEY ("types_of_clearance_id") REFERENCES "public"."clearance_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_declaration_office_id_sub_office_master_t_id_fk" FOREIGN KEY ("declaration_office_id") REFERENCES "public"."sub_office_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_commodity_id_commodity_master_t_id_fk" FOREIGN KEY ("commodity_id") REFERENCES "public"."commodity_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_fret_currency_id_currency_master_t_id_fk" FOREIGN KEY ("fret_currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_other_charges_currency_id_currency_master_t_id_fk" FOREIGN KEY ("other_charges_currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_r_fob_currency_id_currency_master_t_id_fk" FOREIGN KEY ("r_fob_currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_fob_currency_id_currency_master_t_id_fk" FOREIGN KEY ("fob_currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_insurance_amount_currency_id_currency_master_t_id_fk" FOREIGN KEY ("insurance_amount_currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_entry_point_id_transit_point_master_t_id_fk" FOREIGN KEY ("entry_point_id") REFERENCES "public"."transit_point_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_document_status_id_document_status_master_t_id_fk" FOREIGN KEY ("document_status_id") REFERENCES "public"."document_status_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_border_warehouse_id_transit_point_master_t_id_fk" FOREIGN KEY ("border_warehouse_id") REFERENCES "public"."transit_point_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_bonded_warehouse_id_transit_point_master_t_id_fk" FOREIGN KEY ("bonded_warehouse_id") REFERENCES "public"."transit_point_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_clearing_status_id_clearing_status_master_t_id_fk" FOREIGN KEY ("clearing_status_id") REFERENCES "public"."clearing_status_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_imports_t_mca_ref" ON "imports_t" USING btree ("mca_ref") WHERE "imports_t"."mca_ref" IS NOT NULL AND "imports_t"."mca_ref" <> '';--> statement-breakpoint
CREATE INDEX "idx_imports_t_client" ON "imports_t" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_imports_t_license" ON "imports_t" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "idx_imports_t_clearing_status" ON "imports_t" USING btree ("clearing_status_id");--> statement-breakpoint
CREATE INDEX "idx_imports_t_pre_alert_date" ON "imports_t" USING btree ("pre_alert_date");--> statement-breakpoint
CREATE INDEX "idx_imports_t_display" ON "imports_t" USING btree ("display");