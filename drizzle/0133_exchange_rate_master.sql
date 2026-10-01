-- Exchange Rate master — the day's reference rates (§4.1).
--
-- Two numbers belong to the DAY rather than to any bank: the Banque Centrale du
-- Congo publication, and the rate declarations are filed at. The BCC was being
-- typed again on every bank row of the board — the same figure stored once per
-- bank, which is once per bank it can disagree with itself — and the
-- declaration rate had nowhere to live at all.
--
-- This does NOT replace bank_exchange_rate_t.bcc_rate. That column records what
-- a day was actually saved with and what the invoices were quoted against;
-- rewriting it from a master edited later would change history (§4.28's reason
-- for keeping a before-value). The board READS this to prefill, nothing more.

CREATE TABLE IF NOT EXISTS "exchange_rate_master_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "rate_date" date NOT NULL,
  "currency_id" integer NOT NULL,
  "declaration_rate" numeric(10, 4),
  "bcc_rate" numeric(10, 4),
  "display" varchar(1) DEFAULT 'Y' NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "exchange_rate_master_t"
    ADD CONSTRAINT "exchange_rate_master_t_currency_id_currency_master_t_id_fk"
    FOREIGN KEY ("currency_id") REFERENCES "currency_master_t"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "exchange_rate_master_t"
    ADD CONSTRAINT "exchange_rate_master_t_created_by_users_t_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users_t"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "exchange_rate_master_t"
    ADD CONSTRAINT "exchange_rate_master_t_updated_by_users_t_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "users_t"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- One LIVE row per day per currency. Two would make "the day's BCC" ambiguous
-- and the board would take whichever the plan returned first. Partial on
-- display so a withdrawn day frees its slot, as bank_exchange_rate_t does.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_exchange_rate_master_day"
  ON "exchange_rate_master_t" ("rate_date", "currency_id") WHERE "display" = 'Y';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_exchange_rate_master_date"
  ON "exchange_rate_master_t" ("rate_date");
--> statement-breakpoint

-- The master screen's sidebar entry, beside Bank Exchange Rates, which is what
-- it feeds. Parent resolved BY NAME (the 0089 pattern).
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 4, 1, 'Exchange Rate', '/masters/exchange-rates', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Masters' AND p."menu_level" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/masters/exchange-rates'
  );
--> statement-breakpoint

-- §4.7 — the menu URL IS the permission resource, so a new screen with no
-- mapping row is denied to everyone, Super Admin included. Granted exactly as
-- Bank Exchange Rates is: the same people who keep the daily board keep the
-- day's reference rates.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", d."id",
       r."can_view", r."can_add", r."can_edit", r."can_delete", r."can_approve",
       r."can_restore", r."can_permanent_delete", r."can_export", r."can_import", r."can_print",
       r."can_view_audit", r."can_export_audit", r."can_manage_settings"
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" src ON src."id" = r."menu_id" AND src."url" = '/bank-exchange-rates'
  JOIN "menu_master_t" d ON d."url" = '/masters/exchange-rates'
 WHERE NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
