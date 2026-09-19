-- §4.1 / §4.6 / §4.7 — the Payment Request approval chain becomes configuration.
--
-- Until now only WHO approves each stage was a table (payment_stage_role_master_t),
-- and it had no screen. The chain itself — stage names, order, which payment
-- types a stage applies to, and what each one asks the approver for — was
-- written into the code in about ten places. This moves all of it into:
--
--   payment_stage_master_t   one row per stage (Masters → Payment Stages)
--   payment_stage_role_...   who may act, now optionally per LOCATION
--                            (Mapping → Role Payment Stage Mapping)
--
-- The five stage slots stay fixed because each writes its own columns on
-- payment_request_t; everything about them is a row. The seeded rows reproduce
-- the chain exactly as it ran before, so nothing changes until someone edits one.

CREATE TABLE IF NOT EXISTS "payment_stage_master_t" (
  "id"                      serial PRIMARY KEY,
  "stage"                   varchar(20) NOT NULL,
  "label"                   varchar(60) NOT NULL,
  "pending_label"           varchar(60) NOT NULL,
  "sort_order"              integer NOT NULL,
  "payment_type"            varchar(10),
  "captures_chargeback"     boolean NOT NULL DEFAULT false,
  "requires_cash_collector" boolean NOT NULL DEFAULT false,
  "captures_documents"      boolean NOT NULL DEFAULT false,
  "print_signature"         boolean NOT NULL DEFAULT false,
  "tone"                    varchar(20) NOT NULL DEFAULT 'slate',
  "display"                 varchar(1) NOT NULL DEFAULT 'Y',
  "created_by"              integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by"              integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at"              timestamp NOT NULL DEFAULT now(),
  "updated_at"              timestamp NOT NULL DEFAULT now(),
  -- The slots are the columns on payment_request_t; a row naming anything else
  -- would configure a stage nothing can record.
  CONSTRAINT "payment_stage_master_t_stage_check"
    CHECK ("stage" IN ('dept', 'finance', 'management', 'under_process', 'paid')),
  CONSTRAINT "payment_stage_master_t_payment_type_check"
    CHECK ("payment_type" IS NULL OR "payment_type" IN ('Bank', 'Cash')),
  CONSTRAINT "payment_stage_master_t_tone_check"
    CHECK ("tone" IN ('amber', 'cyan', 'violet', 'sky', 'orange', 'blue', 'teal', 'fuchsia', 'slate')),
  CONSTRAINT "payment_stage_master_t_display_check"
    CHECK ("display" IN ('Y', 'N'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_stage_master_stage"
  ON "payment_stage_master_t" ("stage");
--> statement-breakpoint

-- The chain as it ran: Department (records the chargeback) → Finance →
-- Management → Under Process (Bank only) → Paid (cash collector + proof of
-- payment). Department, Management and Finance sign the printed Demande de Fonds.
INSERT INTO "payment_stage_master_t"
  ("stage", "label", "pending_label", "sort_order", "payment_type",
   "captures_chargeback", "requires_cash_collector", "captures_documents", "print_signature", "tone")
VALUES
  ('dept',          'Department',    'Pending Dept',    10, NULL,   true,  false, false, true,  'amber'),
  ('finance',       'Finance',       'Pending Finance', 20, NULL,   false, false, false, true,  'cyan'),
  ('management',    'Management',    'Pending Mgmt',    30, NULL,   false, false, false, true,  'violet'),
  ('under_process', 'Under Process', 'Under Process',   40, 'Bank', false, false, false, false, 'sky'),
  ('paid',          'Paid',          'Pending Payment', 50, NULL,   false, true,  true,  false, 'orange')
ON CONFLICT ("stage") DO NOTHING;
--> statement-breakpoint

-- Grants gain an optional location: NULL = every office, which is what every
-- existing row meant, so no row changes meaning.
ALTER TABLE "payment_stage_role_master_t"
  ADD COLUMN IF NOT EXISTS "location_id" integer REFERENCES "main_office_master_t"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- One grant per (stage, role, location scope). COALESCE, because a plain unique
-- index treats every NULL as distinct and would admit duplicate "all locations"
-- grants.
DROP INDEX IF EXISTS "uq_payment_stage_role_t";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_stage_role_loc"
  ON "payment_stage_role_master_t" ("stage", "role_id", (COALESCE("location_id", 0)));
--> statement-breakpoint

-- The two screens. Parents resolved by NAME and guarded on URL, as 0082 does:
-- a no-op on a fresh database (seedMenus creates both), fills them in on a
-- populated one.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 205, 1, 'Payment Stages', '/masters/payment-stages', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Masters' AND p."menu_level" = 0
  AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/masters/payment-stages');
--> statement-breakpoint

INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 5, 1, 'Role Payment Stage Mapping', '/mapping/roletopaymentstage', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Mapping' AND p."menu_level" = 0
  AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/mapping/roletopaymentstage');
--> statement-breakpoint

-- §4.7 — a screen with no grant is a 403 for everyone; the Super Admin gets the
-- full grant, other roles through /mapping/roletomenu.
INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve")
SELECT 1, m."id", true, true, true, true, true
FROM "menu_master_t" m
WHERE m."url" IN ('/masters/payment-stages', '/mapping/roletopaymentstage')
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_mapping_t" r WHERE r."role_id" = 1 AND r."menu_id" = m."id"
  );
