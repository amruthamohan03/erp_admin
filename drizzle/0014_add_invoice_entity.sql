CREATE TABLE "invoice_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" varchar(100) NOT NULL,
	"client_id" integer NOT NULL,
	"license_id" integer,
	"state" varchar(50) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"tax" numeric(18, 2),
	"total_amount" numeric(18, 2),
	"currency" varchar(3) NOT NULL,
	"issue_date" date,
	"due_date" date,
	"paid_at" timestamp,
	"notes" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_t_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
ALTER TABLE "invoice_t" ADD CONSTRAINT "invoice_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_t" ADD CONSTRAINT "invoice_t_license_id_license_t_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."license_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_t" ADD CONSTRAINT "invoice_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_t" ADD CONSTRAINT "invoice_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;