CREATE TABLE "currency_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency_name" varchar(100) NOT NULL,
	"currency_short_name" varchar(10) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "currency_master_t" ADD CONSTRAINT "currency_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "currency_master_t" ADD CONSTRAINT "currency_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "currency_master_t" ("id", "currency_name", "currency_short_name", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(1, 'DOLLAR', 'USD', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(2, 'CONGOLESE FRANC', 'CDF', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(3, 'EURO', 'EUR', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(4, 'SOTH AFRICAN RAND', 'ZAR', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(5, 'AUSTRALIAN DOLLAR', 'AUD', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('currency_master_t', 'id'), (SELECT MAX(id) FROM "currency_master_t"));
