CREATE TABLE "exports_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"license_id" integer,
	"kind_id" integer,
	"type_of_goods_id" integer,
	"transport_mode_id" integer,
	"mca_ref" varchar(100),
	"currency_id" integer,
	"buyer" varchar(255),
	"regime_id" integer,
	"types_of_clearance_id" integer,
	"invoice" varchar(100),
	"po_ref" varchar(100),
	"bp_no" varchar(100),
	"weight" numeric(10, 3),
	"fob" numeric(15, 2),
	"number_of_bags" integer,
	"lot_number" varchar(100),
	"horse" varchar(50),
	"trailer_1" varchar(50),
	"trailer_2" varchar(50),
	"feet_container_id" integer,
	"wagon_ref" varchar(50),
	"container" varchar(50),
	"transporter" varchar(255),
	"site_of_loading_id" integer,
	"destination" varchar(255),
	"exit_point_id" integer,
	"dgda_seal_no" varchar(255),
	"number_of_seals" integer,
	"ceec_amount" numeric(10, 2),
	"cgea_amount" numeric(10, 2),
	"occ_amount" numeric(10, 2),
	"lmc_amount" numeric(10, 2),
	"ogefrem_amount" numeric(10, 2),
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
	"document_status_id" integer,
	"customs_clearing_code" varchar(100),
	"dgda_in_date" date,
	"declaration_reference" varchar(100),
	"liquidation_reference" varchar(100),
	"liquidation_date" date,
	"liquidation_paid_by" varchar(100),
	"liquidation_amount" numeric(15, 2),
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
	"truck_status_id" integer,
	"lmc_id" varchar(100),
	"ogefrem_inv_ref" varchar(100),
	"loading_to_dispatch_date" date,
	"lmc_date" date,
	"ogefrem_date" date,
	"audited_date" date,
	"archived_date" date,
	"clearing_status_id" integer,
	"remarks" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_license_id_license_t_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."license_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_kind_id_kind_master_t_id_fk" FOREIGN KEY ("kind_id") REFERENCES "public"."kind_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_type_of_goods_id_type_of_goods_master_t_id_fk" FOREIGN KEY ("type_of_goods_id") REFERENCES "public"."type_of_goods_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_transport_mode_id_transport_mode_master_t_id_fk" FOREIGN KEY ("transport_mode_id") REFERENCES "public"."transport_mode_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_currency_id_currency_master_t_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_regime_id_regime_master_t_id_fk" FOREIGN KEY ("regime_id") REFERENCES "public"."regime_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_types_of_clearance_id_clearance_master_t_id_fk" FOREIGN KEY ("types_of_clearance_id") REFERENCES "public"."clearance_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_feet_container_id_feet_container_master_t_id_fk" FOREIGN KEY ("feet_container_id") REFERENCES "public"."feet_container_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_site_of_loading_id_transit_point_master_t_id_fk" FOREIGN KEY ("site_of_loading_id") REFERENCES "public"."transit_point_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_exit_point_id_transit_point_master_t_id_fk" FOREIGN KEY ("exit_point_id") REFERENCES "public"."transit_point_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_document_status_id_document_status_master_t_id_fk" FOREIGN KEY ("document_status_id") REFERENCES "public"."document_status_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_truck_status_id_truck_status_master_t_id_fk" FOREIGN KEY ("truck_status_id") REFERENCES "public"."truck_status_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_clearing_status_id_clearing_status_master_t_id_fk" FOREIGN KEY ("clearing_status_id") REFERENCES "public"."clearing_status_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_exports_t_mca_ref" ON "exports_t" USING btree ("mca_ref") WHERE "exports_t"."mca_ref" IS NOT NULL AND "exports_t"."mca_ref" <> '';--> statement-breakpoint
CREATE INDEX "idx_exports_t_client" ON "exports_t" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_exports_t_license" ON "exports_t" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "idx_exports_t_clearing_status" ON "exports_t" USING btree ("clearing_status_id");--> statement-breakpoint
CREATE INDEX "idx_exports_t_loading_date" ON "exports_t" USING btree ("loading_date");--> statement-breakpoint
CREATE INDEX "idx_exports_t_display" ON "exports_t" USING btree ("display");