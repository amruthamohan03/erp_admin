-- 0048 — Payment Request transaction page: MCA reference grid + pay_for rules.
--
-- The reference machinery (payment_request_t.mca_data, the batched existence and
-- duplicate queries in src/db/queries/paymentMca.ts, /api/v1/payments/[id]/mca)
-- was already built but had no way in from the UI: the transaction page carried
-- eleven header fields and no reference lines at all. This migration adds the
-- config that renders them and the pay_for-driven rules around them (§4.1 — the
-- behaviour is config, the renderer is generic).
--
-- Idempotent throughout; safe to re-run.

--------------------------------------------------------------------------------
-- 1. Allow the 'mca-grid' field type.
--
-- Restates the whole enum because a CHECK constraint cannot be extended in place.
-- Keep this list in sync with FieldType in src/types/index.ts.
--------------------------------------------------------------------------------
ALTER TABLE "master_page_accordion_field_t"
  DROP CONSTRAINT IF EXISTS master_page_accordion_field_t_field_type_check;
ALTER TABLE "master_page_accordion_field_t"
  ADD CONSTRAINT master_page_accordion_field_t_field_type_check
  CHECK (field_type IN (
    'text','textarea','email','tel','number','date','select',
    'checkbox-group','file','seal-picker','partielle-picker','mca-grid'
  ));

--------------------------------------------------------------------------------
-- 2. The References accordion, between Payment Details and Motif.
--------------------------------------------------------------------------------
UPDATE "master_page_accordion_t" a
   SET "display_order" = 3
  FROM "master_page_t" p
 WHERE a."page_id" = p."id" AND p."slug" = 'payment'
   AND a."slug" = 'motif' AND a."display_order" <> 3;

INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "display_order", "display")
SELECT p."id", 'references', 'Tracking References', 'ti ti-list-numbers', 2, 'Y'
  FROM "master_page_t" p
 WHERE p."slug" = 'payment'
   AND NOT EXISTS (
     SELECT 1 FROM "master_page_accordion_t" x
      WHERE x."page_id" = p."id" AND x."slug" = 'references');

-- Same role grants the page's first section already carries, so whoever can edit
-- a request can edit its references — copied rather than hardcoded to role 1, so
-- a database whose grants were widened keeps them.
INSERT INTO "master_page_accordion_role_t" ("accordion_id", "role_id", "permission")
SELECT refs."id", g."role_id", g."permission"
  FROM "master_page_accordion_t" refs
  JOIN "master_page_t" p ON p."id" = refs."page_id"
  JOIN "master_page_accordion_t" basic
    ON basic."page_id" = p."id" AND basic."slug" = 'basic'
  JOIN "master_page_accordion_role_t" g ON g."accordion_id" = basic."id"
 WHERE p."slug" = 'payment' AND refs."slug" = 'references'
   AND NOT EXISTS (
     SELECT 1 FROM "master_page_accordion_role_t" x
      WHERE x."accordion_id" = refs."id" AND x."role_id" = g."role_id");

--------------------------------------------------------------------------------
-- 3. The grid field itself.
--
-- Required: a request exists to pay against something, and the header amount is
-- derived from these lines (step 5), so a request with no references would carry
-- an amount nothing accounts for.
--------------------------------------------------------------------------------
INSERT INTO "master_page_accordion_field_t"
  ("accordion_id", "name", "label", "field_type", "required", "props", "display_order", "display")
SELECT a."id", 'mca_data', 'Tracking References', 'mca-grid', true,
       '{"colSpan": "12"}'::jsonb, 1, 'Y'
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE p."slug" = 'payment' AND a."slug" = 'references'
   AND NOT EXISTS (
     SELECT 1 FROM "master_page_accordion_field_t" f
      WHERE f."accordion_id" = a."id" AND f."name" = 'mca_data');

--------------------------------------------------------------------------------
-- 4. Client is required only for the tracking categories.
--
-- pay_for 0 Import / 1 Export / 2 Local resolve their references against a
-- client's tracking rows, so the client must be known before a reference can be
-- validated. 3 Other / 4 Pre Payment generate their references from the location
-- and have no client to check against.
--------------------------------------------------------------------------------
UPDATE "master_page_accordion_field_t" f
   SET "conditions" = '{"requiredWhen": {"in": [0, 1, 2], "field": "pay_for"}}'::jsonb
  FROM "master_page_accordion_t" a, "master_page_t" p
 WHERE f."accordion_id" = a."id" AND a."page_id" = p."id"
   AND p."slug" = 'payment' AND f."name" = 'client_id'
   AND COALESCE(f."conditions" -> 'requiredWhen', 'null'::jsonb) = 'null'::jsonb;

--------------------------------------------------------------------------------
-- 5. Amount is the sum of the reference lines, not a hand-typed number.
--
-- A `sumJson` derive is pure, so the client recomputes it live and the server
-- re-enforces it on save. That turns "the sum of the reference amounts must equal
-- the header amount" from a rule that can be violated into one that cannot.
--------------------------------------------------------------------------------
UPDATE "master_page_accordion_field_t" f
   SET "derive" = '{"kind": "sumJson", "field": "mca_data", "amountKey": "amount"}'::jsonb
  FROM "master_page_accordion_t" a, "master_page_t" p
 WHERE f."accordion_id" = a."id" AND a."page_id" = p."id"
   AND p."slug" = 'payment' AND f."name" = 'amount'
   AND COALESCE(f."derive" ->> 'kind', '') IS DISTINCT FROM 'sumJson';

--------------------------------------------------------------------------------
-- 6. Expense Type lists only the types flagged for the selected category.
--
-- The endpoint maps pay_for 0-4 onto its is_import / is_export / is_local /
-- is_other / is_advance flags, so the config passes the raw form value and does
-- not need to know the flag column names.
--------------------------------------------------------------------------------
UPDATE "master_page_accordion_field_t" f
   SET "props" = COALESCE(f."props", '{}'::jsonb)
                 || '{"optionsParams": {"pay_for": "pay_for"}}'::jsonb
  FROM "master_page_accordion_t" a, "master_page_t" p
 WHERE f."accordion_id" = a."id" AND a."page_id" = p."id"
   AND p."slug" = 'payment' AND f."name" = 'expense_type'
   AND COALESCE(f."props" -> 'optionsParams', 'null'::jsonb)
       IS DISTINCT FROM '{"pay_for": "pay_for"}'::jsonb;
