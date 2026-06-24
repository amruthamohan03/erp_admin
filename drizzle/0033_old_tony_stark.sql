CREATE TABLE "invoice_bank_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_bank_name" varchar(255) NOT NULL,
	"invoice_bank_account_name" varchar(255) NOT NULL,
	"invoice_bank_account_number" varchar(50) NOT NULL,
	"invoice_bank_swift" varchar(20),
	"invoice_bank_address" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_bank_master_t" ADD CONSTRAINT "invoice_bank_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_bank_master_t" ADD CONSTRAINT "invoice_bank_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;