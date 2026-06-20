CREATE TABLE "quotations_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"quotation_ref" varchar(255) NOT NULL,
	"quotation_date" date,
	"sub_total" numeric(15, 2) DEFAULT '0',
	"vat_amount" numeric(15, 2) DEFAULT '0',
	"total_amount" numeric(15, 2) DEFAULT '0',
	"sub_total_cdf" numeric(15, 2),
	"vat_amount_cdf" numeric(15, 2),
	"total_amount_cdf" numeric(15, 2),
	"arsp" varchar(10),
	"arsp_amount" numeric(15, 2) DEFAULT '0',
	"kind_id" integer,
	"transport_mode_id" integer,
	"goods_type_id" integer,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_items_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" integer NOT NULL,
	"category_id" integer,
	"item_id" integer,
	"quantity" numeric(10, 2) DEFAULT '1',
	"unit_id" integer,
	"unit_text" varchar(100),
	"taux_usd" numeric(10, 2),
	"cost_usd" numeric(10, 2),
	"subtotal_usd" numeric(10, 2),
	"currency_id" integer,
	"has_tva" boolean DEFAULT false NOT NULL,
	"tva_usd" numeric(15, 2) DEFAULT '0',
	"total_usd" numeric(15, 2) DEFAULT '0',
	"cif_split" numeric(15, 2) DEFAULT '0',
	"percentage" numeric(10, 4) DEFAULT '0',
	"rate_cdf" numeric(15, 2) DEFAULT '0',
	"vat_cdf" numeric(15, 2) DEFAULT '0',
	"total_cdf" numeric(15, 2) DEFAULT '0',
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotations_t" ADD CONSTRAINT "quotations_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations_t" ADD CONSTRAINT "quotations_t_kind_id_kind_master_t_id_fk" FOREIGN KEY ("kind_id") REFERENCES "public"."kind_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations_t" ADD CONSTRAINT "quotations_t_transport_mode_id_transport_mode_master_t_id_fk" FOREIGN KEY ("transport_mode_id") REFERENCES "public"."transport_mode_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations_t" ADD CONSTRAINT "quotations_t_goods_type_id_type_of_goods_master_t_id_fk" FOREIGN KEY ("goods_type_id") REFERENCES "public"."type_of_goods_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations_t" ADD CONSTRAINT "quotations_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations_t" ADD CONSTRAINT "quotations_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items_t" ADD CONSTRAINT "quotation_items_t_quotation_id_quotations_t_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations_t"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items_t" ADD CONSTRAINT "quotation_items_t_category_id_quotation_category_master_t_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."quotation_category_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items_t" ADD CONSTRAINT "quotation_items_t_item_id_item_master_t_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items_t" ADD CONSTRAINT "quotation_items_t_unit_id_unit_master_t_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items_t" ADD CONSTRAINT "quotation_items_t_currency_id_currency_master_t_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items_t" ADD CONSTRAINT "quotation_items_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items_t" ADD CONSTRAINT "quotation_items_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quotations_t_ref" ON "quotations_t" USING btree ("quotation_ref") WHERE "quotations_t"."display" = 'Y';--> statement-breakpoint
CREATE INDEX "idx_quotations_t_client" ON "quotations_t" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_quotations_t_kind" ON "quotations_t" USING btree ("kind_id");--> statement-breakpoint
CREATE INDEX "idx_quotations_t_display" ON "quotations_t" USING btree ("display");--> statement-breakpoint
CREATE INDEX "idx_quotation_items_t_quotation" ON "quotation_items_t" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "idx_quotation_items_t_category" ON "quotation_items_t" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_quotation_items_t_item" ON "quotation_items_t" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_quotation_items_t_display" ON "quotation_items_t" USING btree ("display");