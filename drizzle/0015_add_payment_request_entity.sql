CREATE TABLE "payment_request_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_number" varchar(100) NOT NULL,
	"client_id" integer,
	"invoice_id" integer,
	"state" varchar(50) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"purpose" varchar(255),
	"current_approval_level" integer DEFAULT 0 NOT NULL,
	"approved_at" timestamp,
	"paid_at" timestamp,
	"due_date" date,
	"notes" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_request_t_request_number_unique" UNIQUE("request_number")
);
--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_client_id_client_master_t_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_invoice_id_invoice_t_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_t" ADD CONSTRAINT "payment_request_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;