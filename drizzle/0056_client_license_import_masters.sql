-- 0056 — the three masters the client / license / import corrections need, plus
-- the columns that let those fields point at a master instead of free text.
--
-- Structure and data in one reviewed migration (§7.2): a column that gains a
-- foreign key is backfilled in the same step, so a fresh database and this one
-- end up identical.

-- ---------------------------------------------------------------------------
-- 1. Payment Method master
--
-- `license_t.payment_method_id` pointed at `payment_type_master_t`, which holds
-- exactly two rows — EXPORT and IMPORT. Those are not payment methods: they are
-- the parent that scopes the 30 customs payment SUBtypes. That is why the
-- License form's "Payment Method" dropdown offered "EXPORT" and "IMPORT".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "payment_method_master_t" (
  "id" serial PRIMARY KEY,
  "payment_method_name" varchar(150) NOT NULL,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

INSERT INTO "payment_method_master_t" ("payment_method_name", "created_by", "updated_by")
SELECT v, 1, 1 FROM (VALUES
  ('CASH'), ('BANK TRANSFER'), ('CHEQUE'), ('LETTER OF CREDIT')
) AS s(v)
 WHERE NOT EXISTS (SELECT 1 FROM "payment_method_master_t");

-- ---------------------------------------------------------------------------
-- 2. Payment Term master
--
-- Promoted out of five hardcoded `options_static` entries on the Clients page.
-- The names match those labels exactly so the backfill below is unambiguous.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "payment_term_master_t" (
  "id" serial PRIMARY KEY,
  "payment_term_name" varchar(100) NOT NULL,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

INSERT INTO "payment_term_master_t" ("payment_term_name", "created_by", "updated_by")
SELECT v, 1, 1 FROM (VALUES
  ('Advance'), ('15 Days'), ('30 Days'), ('45 Days'), ('60 Days')
) AS s(v)
 WHERE NOT EXISTS (SELECT 1 FROM "payment_term_master_t");

-- ---------------------------------------------------------------------------
-- 3. Clearing Basis master
--
-- Deliberately seeded with NO rows. What an import is cleared on the basis of is
-- operational data belonging to the operator; inventing plausible-looking customs
-- values here would be worse than an empty list they fill in themselves.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "clearing_basis_master_t" (
  "id" serial PRIMARY KEY,
  "clearing_basis_name" varchar(200) NOT NULL,
  "display" varchar(1) NOT NULL DEFAULT 'Y',
  "created_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. License: point Payment Method at the new master, and carry the MCA reference
--
-- No licence row currently sets payment_method_id, so swapping the target of the
-- foreign key loses nothing. Checked rather than assumed — if a value ever did
-- exist it would be an id from the wrong table.
-- ---------------------------------------------------------------------------
UPDATE "license_t" SET "payment_method_id" = NULL WHERE "payment_method_id" IS NOT NULL;

ALTER TABLE "license_t" DROP CONSTRAINT IF EXISTS "license_t_payment_method_id_fk";
ALTER TABLE "license_t" DROP CONSTRAINT IF EXISTS "licenses_t_payment_method_id_fk";
ALTER TABLE "license_t"
  ADD CONSTRAINT "license_t_payment_method_id_fk"
  FOREIGN KEY ("payment_method_id") REFERENCES "payment_method_master_t"("id") ON DELETE SET NULL;

-- The MCA reference now lives on the licence, which is what lets Import Tracking
-- narrow Client → MCA Reference → License without a new join table.
ALTER TABLE "license_t" ADD COLUMN IF NOT EXISTS "mca_ref" varchar(100);
CREATE INDEX IF NOT EXISTS "idx_license_t_client_mca" ON "license_t" ("client_id", "mca_ref");

-- ---------------------------------------------------------------------------
-- 5. Client: Location reads Main Office; Payment Term reads its master
--
-- office_location_id referenced office_location_master_t. No client row sets it,
-- so retargeting is safe; the column name is kept so nothing else has to move.
-- ---------------------------------------------------------------------------
UPDATE "client_master_t" SET "office_location_id" = NULL WHERE "office_location_id" IS NOT NULL;

ALTER TABLE "client_master_t" DROP CONSTRAINT IF EXISTS "clients_t_office_location_id_fk";
ALTER TABLE "client_master_t" DROP CONSTRAINT IF EXISTS "client_master_t_office_location_id_fk";
ALTER TABLE "client_master_t"
  ADD CONSTRAINT "client_master_t_office_location_id_fk"
  FOREIGN KEY ("office_location_id") REFERENCES "main_office_master_t"("id") ON DELETE SET NULL;

-- The legacy free-text payment_term is KEPT, not dropped: the clients dashboard
-- still groups by it and a destructive change is not worth bundling here. New
-- saves write payment_term_id; the dashboard reads through the join.
ALTER TABLE "client_master_t" ADD COLUMN IF NOT EXISTS "payment_term_id" integer;
ALTER TABLE "client_master_t" DROP CONSTRAINT IF EXISTS "client_master_t_payment_term_id_fk";
ALTER TABLE "client_master_t"
  ADD CONSTRAINT "client_master_t_payment_term_id_fk"
  FOREIGN KEY ("payment_term_id") REFERENCES "payment_term_master_t"("id") ON DELETE SET NULL;

UPDATE "client_master_t" c
   SET "payment_term_id" = t."id"
  FROM "payment_term_master_t" t
 WHERE c."payment_term_id" IS NULL
   AND c."payment_term" IS NOT NULL
   AND upper(replace(replace(c."payment_term", ' ', ''), 'days', 'DAYS'))
       = upper(replace(t."payment_term_name", ' ', ''));

-- ---------------------------------------------------------------------------
-- 6. Imports: Truck Status and Clearing Based On become foreign keys
--
-- Both columns are varchar and entirely NULL across every row, so retyping in
-- place cannot lose data. They are renamed to the project's `_id` convention in
-- the same step — the page config is repointed in migration 0057.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'imports_t' AND column_name = 'truck_status') THEN
    -- Guard rather than assume: refuse to silently discard values if any exist.
    IF EXISTS (SELECT 1 FROM "imports_t" WHERE "truck_status" IS NOT NULL) THEN
      RAISE EXCEPTION 'imports_t.truck_status holds values; migrate them before retyping';
    END IF;
    ALTER TABLE "imports_t" DROP COLUMN "truck_status";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'imports_t' AND column_name = 'clearing_based_on') THEN
    IF EXISTS (SELECT 1 FROM "imports_t" WHERE "clearing_based_on" IS NOT NULL) THEN
      RAISE EXCEPTION 'imports_t.clearing_based_on holds values; migrate them before retyping';
    END IF;
    ALTER TABLE "imports_t" DROP COLUMN "clearing_based_on";
  END IF;
END $$;

ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "truck_status_id" integer;
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_truck_status_id_fk";
ALTER TABLE "imports_t"
  ADD CONSTRAINT "imports_t_truck_status_id_fk"
  FOREIGN KEY ("truck_status_id") REFERENCES "truck_status_master_t"("id") ON DELETE SET NULL;

ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "clearing_basis_id" integer;
ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_clearing_basis_id_fk";
ALTER TABLE "imports_t"
  ADD CONSTRAINT "imports_t_clearing_basis_id_fk"
  FOREIGN KEY ("clearing_basis_id") REFERENCES "clearing_basis_master_t"("id") ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 7. Menus for the three new masters (§4.7 — the menu URL is the permission
--    resource, so a master with no menu row can never be granted).
-- ---------------------------------------------------------------------------
INSERT INTO "menu_master_t" ("menu_name", "menu_order", "url", "icon", "menu_level", "menu_id", "display")
SELECT s.name, s.ord, s.url, 'ti ti-list-details', 1,
       (SELECT "id" FROM "menu_master_t" WHERE lower("menu_name") = 'masters' AND "menu_level" = 0 LIMIT 1),
       'Y'
  FROM (VALUES
    ('Payment Method', 71, '/masters/payment-methods'),
    ('Payment Term',   72, '/masters/payment-terms'),
    ('Clearing Basis', 73, '/masters/clearing-bases')
  ) AS s(name, ord, url)
 WHERE NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = s.url);

INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_restore", "can_permanent_delete", "can_export", "can_print")
SELECT 1, m."id", true, true, true, true, true, true, true, true
  FROM "menu_master_t" m
 WHERE m."url" IN ('/masters/payment-methods', '/masters/payment-terms', '/masters/clearing-bases')
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x WHERE x."role_id" = 1 AND x."menu_id" = m."id");
