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
ALTER TABLE "invoice_bank_master_t" ADD CONSTRAINT "invoice_bank_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoice_bank_master_t" ADD CONSTRAINT "invoice_bank_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "invoice_bank_master_t" ("id", "invoice_bank_name", "invoice_bank_account_name", "invoice_bank_account_number", "invoice_bank_swift", "invoice_bank_address", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(1, 'EQUITY BCDC', 'MALABAR RDC SARL', '00011-00130-00001020614-41/USD', 'BCDCCDKI', 'LUBUMBASHI, R.D. CONGO', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(2, 'RAWBANK', 'MALABAR RDC SARL', '05100-05130-01003333601-20', 'RAWBCDKI', 'LUBUMBASHI, R.D. CONGO', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(3, 'EQUITY BCDC', 'MALABAR RDC SARL V/C KAMOA COPPER SA-DGDA', '00011-15055-52000867229-60/USD', 'BCDCCDKIxxx', 'LUBUMBASHI, R.D. CONGO', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('invoice_bank_master_t', 'id'), (SELECT MAX(id) FROM "invoice_bank_master_t"));
