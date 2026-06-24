CREATE TABLE "banklist_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_name" varchar(200) NOT NULL,
	"bank_code" varchar(20) NOT NULL,
	"for_exchange" boolean DEFAULT false NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_exchange_rate_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_id" integer NOT NULL,
	"exchange_date" date NOT NULL,
	"currency_id" integer NOT NULL,
	"bcc_rate" numeric(10, 4) DEFAULT '0.0000',
	"bank_rate" numeric(10, 4) DEFAULT '0.0000',
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "banklist_master_t" ADD CONSTRAINT "banklist_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banklist_master_t" ADD CONSTRAINT "banklist_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_exchange_rate_t" ADD CONSTRAINT "bank_exchange_rate_t_bank_id_banklist_master_t_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."banklist_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_exchange_rate_t" ADD CONSTRAINT "bank_exchange_rate_t_currency_id_currency_master_t_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currency_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_exchange_rate_t" ADD CONSTRAINT "bank_exchange_rate_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_exchange_rate_t" ADD CONSTRAINT "bank_exchange_rate_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_banklist_master_t_bank_code" ON "banklist_master_t" USING btree ("bank_code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bank_exchange_rate_t_bank_currency_date" ON "bank_exchange_rate_t" USING btree ("bank_id","currency_id","exchange_date");--> statement-breakpoint
CREATE INDEX "idx_bank_exchange_rate_t_date" ON "bank_exchange_rate_t" USING btree ("exchange_date");--> statement-breakpoint
CREATE INDEX "idx_bank_exchange_rate_t_bank" ON "bank_exchange_rate_t" USING btree ("bank_id");