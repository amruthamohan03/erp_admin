-- Quotation header + line items. Mirrors the source quotations_t / quotation_items_t
-- with real FK constraints (the source kept them as plain indexes). quotation_ref is
-- unique among live (display='Y') rows so a soft-deleted ref can be reused.

CREATE TABLE IF NOT EXISTS "quotations_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer REFERENCES "clients_t"("id"),
  "quotation_ref" varchar(255) NOT NULL,
  "quotation_date" date,
  "sub_total" numeric(15,2) DEFAULT 0,
  "vat_amount" numeric(15,2) DEFAULT 0,
  "total_amount" numeric(15,2) DEFAULT 0,
  "sub_total_cdf" numeric(15,2),
  "vat_amount_cdf" numeric(15,2),
  "total_amount_cdf" numeric(15,2),
  "arsp" varchar(10),
  "arsp_amount" numeric(15,2) DEFAULT 0,
  "kind_id" integer REFERENCES "kind_master_t"("id"),
  "transport_mode_id" integer REFERENCES "transport_mode_master_t"("id"),
  "goods_type_id" integer REFERENCES "type_of_goods_master_t"("id"),
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id"),
  "updated_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_quotations_t_ref" ON "quotations_t" ("quotation_ref") WHERE "display" = 'Y';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quotations_t_client" ON "quotations_t" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quotations_t_kind" ON "quotations_t" ("kind_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quotations_t_display" ON "quotations_t" ("display");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "quotation_items_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "quotation_id" integer NOT NULL REFERENCES "quotations_t"("id"),
  "category_id" integer REFERENCES "quotation_category_master_t"("id"),
  "item_id" integer REFERENCES "item_master_t"("id"),
  "quantity" numeric(10,2) DEFAULT 1,
  "unit_id" integer REFERENCES "unit_master_t"("id"),
  "unit_text" varchar(100),
  "taux_usd" numeric(10,2),
  "cost_usd" numeric(10,2),
  "subtotal_usd" numeric(10,2),
  "currency_id" integer REFERENCES "currency_master_t"("id"),
  "has_tva" boolean NOT NULL DEFAULT false,
  "tva_usd" numeric(15,2) DEFAULT 0,
  "total_usd" numeric(15,2) DEFAULT 0,
  "cif_split" numeric(15,2) DEFAULT 0,
  "percentage" numeric(10,4) DEFAULT 0,
  "rate_cdf" numeric(15,2) DEFAULT 0,
  "vat_cdf" numeric(15,2) DEFAULT 0,
  "total_cdf" numeric(15,2) DEFAULT 0,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id"),
  "updated_by" integer REFERENCES "users_t"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quotation_items_t_quotation" ON "quotation_items_t" ("quotation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quotation_items_t_category" ON "quotation_items_t" ("category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quotation_items_t_item" ON "quotation_items_t" ("item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quotation_items_t_display" ON "quotation_items_t" ("display");
