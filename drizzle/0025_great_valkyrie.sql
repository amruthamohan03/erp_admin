CREATE TABLE "partial_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"partial_name" varchar(150) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regime_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"regime_name" varchar(200) NOT NULL,
	"type" varchar(2) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clearance_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"clearance_name" varchar(255) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_office_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"sub_office_name" varchar(255) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commodity_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"commodity_name" varchar(255) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transit_point_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"transit_point_name" varchar(255) NOT NULL,
	"entry_point" boolean DEFAULT true NOT NULL,
	"exit_point" boolean DEFAULT true NOT NULL,
	"loading" boolean DEFAULT true NOT NULL,
	"destination" boolean DEFAULT true NOT NULL,
	"warehouse" boolean DEFAULT false NOT NULL,
	"location" boolean DEFAULT false NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_status_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_status" varchar(300) NOT NULL,
	"type" varchar(2) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clearing_status_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"clearing_status" varchar(100) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partial_master_t" ADD CONSTRAINT "partial_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partial_master_t" ADD CONSTRAINT "partial_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regime_master_t" ADD CONSTRAINT "regime_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regime_master_t" ADD CONSTRAINT "regime_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_master_t" ADD CONSTRAINT "clearance_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_master_t" ADD CONSTRAINT "clearance_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_office_master_t" ADD CONSTRAINT "sub_office_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_office_master_t" ADD CONSTRAINT "sub_office_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commodity_master_t" ADD CONSTRAINT "commodity_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commodity_master_t" ADD CONSTRAINT "commodity_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transit_point_master_t" ADD CONSTRAINT "transit_point_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transit_point_master_t" ADD CONSTRAINT "transit_point_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_status_master_t" ADD CONSTRAINT "document_status_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_status_master_t" ADD CONSTRAINT "document_status_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearing_status_master_t" ADD CONSTRAINT "clearing_status_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearing_status_master_t" ADD CONSTRAINT "clearing_status_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;