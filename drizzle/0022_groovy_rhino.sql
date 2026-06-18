CREATE TABLE "seal_batch_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"office_location_id" integer,
	"purchase_date" date,
	"total_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_seal" integer DEFAULT 0 NOT NULL,
	"sub_office_code" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seal_number_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"seal_batch_id" integer NOT NULL,
	"seal_number" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'Available' NOT NULL,
	"notes" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seal_number_t_status_check" CHECK ("seal_number_t"."status" IN ('Available', 'Used', 'Damaged'))
);
--> statement-breakpoint
ALTER TABLE "seal_batch_t" ADD CONSTRAINT "seal_batch_t_office_location_id_office_master_t_id_fk" FOREIGN KEY ("office_location_id") REFERENCES "public"."office_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_batch_t" ADD CONSTRAINT "seal_batch_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_batch_t" ADD CONSTRAINT "seal_batch_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_number_t" ADD CONSTRAINT "seal_number_t_seal_batch_id_seal_batch_t_id_fk" FOREIGN KEY ("seal_batch_id") REFERENCES "public"."seal_batch_t"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_number_t" ADD CONSTRAINT "seal_number_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal_number_t" ADD CONSTRAINT "seal_number_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_seal_batch_t_office" ON "seal_batch_t" USING btree ("office_location_id");--> statement-breakpoint
CREATE INDEX "idx_seal_batch_t_purchase_date" ON "seal_batch_t" USING btree ("purchase_date");--> statement-breakpoint
CREATE INDEX "idx_seal_batch_t_display" ON "seal_batch_t" USING btree ("display");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_seal_number_t_seal_number" ON "seal_number_t" USING btree ("seal_number");--> statement-breakpoint
CREATE INDEX "idx_seal_number_t_batch" ON "seal_number_t" USING btree ("seal_batch_id");--> statement-breakpoint
CREATE INDEX "idx_seal_number_t_status" ON "seal_number_t" USING btree ("status");