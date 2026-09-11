-- §4.1/§4.12 — Payment Request opens with the operator's own posting filled in,
-- and in the currency this office actually pays in.
--
-- All three are CONFIG, not code: two `derive` rows and one `props.defaultValue`.
-- Nothing in the renderer learns about locations, departments or currencies.
--
-- Only on a NEW record. `@init` fires only when entityId === 'new'
-- (TransactionalPage), and `defaultValue` is applied only to a create — opening
-- somebody else's saved request must never restamp it with whoever is looking at
-- it, and a stored blank is a decision rather than a gap to fill.

-- Location — from the signed-in user's own location_id (users_t.location_id,
-- FK to main_office_master_t since 0076). `editable: true`: this is a default,
-- not an attribution lock. An operator filing for another office changes it, and
-- who actually saved the row is the audit log's business (§4.28).
UPDATE "master_page_accordion_field_t"
SET "derive" = '{"kind":"fromRelated","source":"session","column":"location_id","trigger":"@init","editable":true}'::jsonb,
    "updated_at" = now()
WHERE "name" = 'location_id'
  AND "accordion_id" IN (
    SELECT a."id" FROM "master_page_accordion_t" a
    JOIN "master_page_t" p ON p."id" = a."page_id"
    WHERE p."slug" = 'payment'
  );
--> statement-breakpoint

-- Department — same, from users_t.dept_id (FK to department_master_t since 0076).
-- Note the column names differ on the two sides: the form field is `department`,
-- the user column is `dept_id`. That is exactly what `column` on the derive is
-- for — the mapping is config, so neither side has to be renamed to suit the other.
UPDATE "master_page_accordion_field_t"
SET "derive" = '{"kind":"fromRelated","source":"session","column":"dept_id","trigger":"@init","editable":true}'::jsonb,
    "updated_at" = now()
WHERE "name" = 'department'
  AND "accordion_id" IN (
    SELECT a."id" FROM "master_page_accordion_t" a
    JOIN "master_page_t" p ON p."id" = a."page_id"
    WHERE p."slug" = 'payment'
  );
--> statement-breakpoint

-- Currency — USD, through the existing `props.defaultValue` mechanism rather than
-- a third derive: there is nothing to look up per session, it is a fixed opening
-- choice, and that is the one this codebase already has for it (§4.10).
--
-- The id is resolved HERE, from currency_master_t's own short name, so each
-- database writes its own id rather than inheriting 1 from this file. `LIMIT 1`
-- because the master carries no uniqueness constraint on the code; ordering by id
-- makes the pick deterministic if a duplicate USD row ever exists.
--
-- A database with no active USD row is left alone — no defaultValue is better
-- than one pointing at a currency that is not there, which would render as a
-- blank-looking select that nonetheless submits a dangling id.
UPDATE "master_page_accordion_field_t" f
SET "props" = COALESCE(f."props", '{}'::jsonb) || jsonb_build_object('defaultValue', usd."id"),
    "updated_at" = now()
FROM (
  SELECT "id" FROM "currency_master_t"
  WHERE upper("currency_short_name") = 'USD' AND "display" = 'Y'
  ORDER BY "id" LIMIT 1
) usd
WHERE f."name" = 'currency'
  AND f."accordion_id" IN (
    SELECT a."id" FROM "master_page_accordion_t" a
    JOIN "master_page_t" p ON p."id" = a."page_id"
    WHERE p."slug" = 'payment'
  )
  -- jsonb_exists(), not `?`: on a row whose props lack the key, `->` yields SQL
  -- NULL and `NOT (NULL ? 'k')` is NULL, so the guard would exclude exactly the
  -- rows it is meant to include (the trap 0083 hit).
  AND NOT jsonb_exists(COALESCE(f."props", '{}'::jsonb), 'defaultValue');
