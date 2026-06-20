CREATE TABLE "kind_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind_name" varchar(100) NOT NULL,
	"kind_short_name" varchar(20) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_mode_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"transport_mode_name" varchar(100) NOT NULL,
	"transport_letter" varchar(5) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "type_of_goods_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"goods_type" varchar(100) NOT NULL,
	"goods_short_name" varchar(20) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_name" varchar(100) NOT NULL,
	"unit_code" varchar(20),
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency_name" varchar(100) NOT NULL,
	"currency_short_name" varchar(10) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_category_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_name" varchar(150) NOT NULL,
	"category_header" varchar(255),
	"display_order" integer DEFAULT 1 NOT NULL,
	"is_customs" boolean DEFAULT false NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_name" varchar(255) NOT NULL,
	"item_code" varchar(50),
	"category_id" integer,
	"tax_not_tax" varchar(1) DEFAULT 'A' NOT NULL,
	"percentage" numeric(10, 2) DEFAULT '0',
	"item_type" varchar(3) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kind_master_t" ADD CONSTRAINT "kind_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kind_master_t" ADD CONSTRAINT "kind_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_mode_master_t" ADD CONSTRAINT "transport_mode_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_mode_master_t" ADD CONSTRAINT "transport_mode_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "type_of_goods_master_t" ADD CONSTRAINT "type_of_goods_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "type_of_goods_master_t" ADD CONSTRAINT "type_of_goods_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_master_t" ADD CONSTRAINT "unit_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_master_t" ADD CONSTRAINT "unit_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_master_t" ADD CONSTRAINT "currency_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_master_t" ADD CONSTRAINT "currency_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_category_master_t" ADD CONSTRAINT "quotation_category_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_category_master_t" ADD CONSTRAINT "quotation_category_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_master_t" ADD CONSTRAINT "item_master_t_category_id_quotation_category_master_t_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."quotation_category_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_master_t" ADD CONSTRAINT "item_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_master_t" ADD CONSTRAINT "item_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_item_master_t_category" ON "item_master_t" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_item_master_t_type" ON "item_master_t" USING btree ("item_type");--> statement-breakpoint
CREATE INDEX "idx_item_master_t_display" ON "item_master_t" USING btree ("display");