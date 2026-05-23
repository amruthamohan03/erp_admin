CREATE TABLE "bank_exchange_rate_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_id" integer NOT NULL,
	"exchange_date" date NOT NULL,
	"currency_id" integer DEFAULT 1 NOT NULL,
	"currency_code" varchar(10) DEFAULT 'USD' NOT NULL,
	"bcc_rate" numeric(10, 4) DEFAULT '0.0000',
	"bank_rate" numeric(10, 4) DEFAULT '0.0000',
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_exchange_rate_t" ADD CONSTRAINT "bank_exchange_rate_t_bank_id_banklist_master_t_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."banklist_master_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bank_exchange_rate_t" ADD CONSTRAINT "bank_exchange_rate_t_currency_id_currency_master_t_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bank_exchange_rate_t" ADD CONSTRAINT "bank_exchange_rate_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bank_exchange_rate_t" ADD CONSTRAINT "bank_exchange_rate_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
WITH seed(id, bank_id, exchange_date, currency_id, currency_code, bcc_rate, bank_rate, created_by, updated_by) AS (
	VALUES
		(1, 1, DATE '2025-12-05', 1, 'USD', 50.0000, 40.0000, 1, 1),
		(2, 2, DATE '2025-12-05', 1, 'USD', 50.0000, 5.0000, 1, 1),
		(3, 5, DATE '2025-12-05', 1, 'USD', 50.0000, 5.0000, 1, 1),
		(4, 7, DATE '2025-12-05', 1, 'USD', 50.0000, 5.0000, 1, 1),
		(5, 1, DATE '2025-12-04', 1, 'USD', 500.0000, 10.0000, 1, 1),
		(6, 1, DATE '2025-12-02', 1, 'USD', 1000.0000, 1100.0000, 1, 1),
		(7, 2, DATE '2025-12-02', 1, 'USD', 1000.0000, 1200.0000, 1, 1),
		(8, 5, DATE '2025-12-02', 1, 'USD', 1000.0000, 1300.0000, 1, 1),
		(9, 7, DATE '2025-12-02', 1, 'USD', 1000.0000, 1400.0000, 1, 1)
)
INSERT INTO "bank_exchange_rate_t" ("id", "bank_id", "exchange_date", "currency_id", "currency_code", "bcc_rate", "bank_rate", "created_by", "updated_by", "created_at", "updated_at")
SELECT s.id, s.bank_id, s.exchange_date, s.currency_id, s.currency_code, s.bcc_rate, s.bank_rate, s.created_by, s.updated_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM seed s
WHERE EXISTS (SELECT 1 FROM "banklist_master_t" b WHERE b.id = s.bank_id)
  AND EXISTS (SELECT 1 FROM "currency_master_t" c WHERE c.id = s.currency_id);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('bank_exchange_rate_t', 'id'), COALESCE((SELECT MAX(id) FROM "bank_exchange_rate_t"), 1));
