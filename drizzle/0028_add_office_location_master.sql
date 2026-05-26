CREATE TABLE "office_location_master_t" (
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
ALTER TABLE "office_location_master_t" ADD CONSTRAINT "office_location_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "office_location_master_t" ADD CONSTRAINT "office_location_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_office_location_province" ON "office_location_master_t" ("province_id");
