CREATE TABLE "license_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"license_no" varchar(100) NOT NULL,
	"client_id" integer NOT NULL,
	"license_type_id" integer NOT NULL,
	"state" varchar(50) NOT NULL,
	"amount" numeric(18, 2),
	"currency" varchar(3),
	"issue_date" date,
	"expiry_date" date,
	"approved_by" integer,
	"approved_at" timestamp,
	"notes" varchar(1000),
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "license_t_license_no_unique" UNIQUE("license_no")
);
--> statement-breakpoint
ALTER TABLE "license_t" ADD CONSTRAINT "license_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_t" ADD CONSTRAINT "license_t_license_type_id_license_type_master_t_id_fk" FOREIGN KEY ("license_type_id") REFERENCES "public"."license_type_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_t" ADD CONSTRAINT "license_t_approved_by_users_t_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_t" ADD CONSTRAINT "license_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_t" ADD CONSTRAINT "license_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;