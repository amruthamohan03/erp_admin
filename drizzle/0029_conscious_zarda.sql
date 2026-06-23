CREATE TABLE "origin_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"origin_name" varchar(255) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "province_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"province_name" varchar(255) NOT NULL,
	"origin_id" integer,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"industry_name" varchar(200) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "done_by_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"done_by_name" varchar(50) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "done_by_master_t_done_by_name_unique" UNIQUE("done_by_name")
);
--> statement-breakpoint
ALTER TABLE "origin_master_t" ADD CONSTRAINT "origin_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "origin_master_t" ADD CONSTRAINT "origin_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "province_master_t" ADD CONSTRAINT "province_master_t_origin_id_origin_master_t_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."origin_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "province_master_t" ADD CONSTRAINT "province_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "province_master_t" ADD CONSTRAINT "province_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_master_t" ADD CONSTRAINT "industry_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_master_t" ADD CONSTRAINT "industry_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "done_by_master_t" ADD CONSTRAINT "done_by_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "done_by_master_t" ADD CONSTRAINT "done_by_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_province_master_t_origin" ON "province_master_t" USING btree ("origin_id");