-- The standing "codes starting with these numbers need a green certificate"
-- rule (§4.1).
--
-- 0087 added `hscode_master_t.requires_green_certificate` as a per-code flag.
-- That works for one code and fails as a RULE: "everything under 0301" had to
-- be re-remembered for every tariff line added afterwards, so the rule quietly
-- stopped covering what it was written to cover. The prefixes live in their own
-- master; the per-code column stays as the override.

CREATE TABLE IF NOT EXISTS "hs_green_prefix_master_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "prefix" varchar(20) NOT NULL,
  "note" varchar(255),
  "display" varchar(1) DEFAULT 'Y' NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "hs_green_prefix_master_t"
    ADD CONSTRAINT "hs_green_prefix_master_t_created_by_users_t_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users_t"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "hs_green_prefix_master_t"
    ADD CONSTRAINT "hs_green_prefix_master_t_updated_by_users_t_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "users_t"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- Unique on the DIGITS, not on the text: `0301` and `03.01` are the same rule
-- written two ways, and two rows saying it would have the second one do nothing
-- while looking like it does something. Partial on display='Y' so a soft-deleted
-- prefix (§4.27) does not block re-adding the same one.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hs_green_prefix_digits"
  ON "hs_green_prefix_master_t" (regexp_replace("prefix", '\D', '', 'g'))
  WHERE "display" = 'Y';
--> statement-breakpoint

-- The per-code flag becomes tri-state, because a two-state column cannot
-- express an EXEMPTION: with the prefixes in play, false has to mean "covered
-- by a rule, but deliberately not required" and NULL has to mean "nobody has
-- said anything, follow the rules".
ALTER TABLE "hscode_master_t"
  ALTER COLUMN "requires_green_certificate" DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE "hscode_master_t"
  ALTER COLUMN "requires_green_certificate" DROP NOT NULL;
--> statement-breakpoint

-- Every existing `false` is the 0087 DEFAULT, not a decision: the form offered
-- a two-state toggle, so nobody could express "exempt" and nothing in the app
-- read the column. Reading them as NULL is what the operators actually meant —
-- leaving them false would exempt the entire catalogue from the first prefix
-- rule anyone adds, and the rule would appear to do nothing.
--
-- `true` rows are left alone. Those ARE decisions, and they go on holding as
-- overrides.
UPDATE "hscode_master_t"
   SET "requires_green_certificate" = NULL
 WHERE "requires_green_certificate" = false;
--> statement-breakpoint

-- The master screen's sidebar entry. Parent resolved BY NAME (the 0089
-- pattern): on a fresh database menus are seeded after migrations, so this is a
-- silent no-op there and seedMenus carries the same row.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 15, 1, 'Green Certificate Codes', '/masters/hs-green-prefixes', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Masters' AND p."menu_level" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/masters/hs-green-prefixes'
  );
--> statement-breakpoint

-- §4.7 — the menu URL IS the permission resource, so a new screen with no
-- mapping row is denied to everyone, Super Admin included.
--
-- Granted exactly as the HS Code master is granted: this edits the same
-- catalogue's rules, so anyone who may maintain HS codes may maintain these,
-- and nobody else gains anything.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", d."id",
       r."can_view", r."can_add", r."can_edit", r."can_delete", r."can_approve",
       r."can_restore", r."can_permanent_delete", r."can_export", r."can_import", r."can_print",
       r."can_view_audit", r."can_export_audit", r."can_manage_settings"
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" src ON src."id" = r."menu_id" AND src."url" = '/masters/hscodes'
  JOIN "menu_master_t" d ON d."url" = '/masters/hs-green-prefixes'
 WHERE NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
