CREATE TABLE "credit_note_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"credit_note_number" varchar(100) NOT NULL,
	"invoice_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"state" varchar(50) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"reason" text NOT NULL,
	"issued_date" date,
	"applied_at" timestamp,
	"notes" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_note_t_credit_note_number_unique" UNIQUE("credit_note_number")
);
--> statement-breakpoint
ALTER TABLE "credit_note_t" ADD CONSTRAINT "credit_note_t_invoice_id_invoice_t_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_t" ADD CONSTRAINT "credit_note_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_t" ADD CONSTRAINT "credit_note_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_t" ADD CONSTRAINT "credit_note_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;