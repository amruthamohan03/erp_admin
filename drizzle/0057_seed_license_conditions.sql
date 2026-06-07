-- §4.12 — config-driven conditional logic for the license form (seeded onto the
-- fields created in 0050). This is the master-data equivalent of the source PHP
-- form's kind-based show/hide + conditional-required + date-chaining rules.
--
-- The business IDs that drive the rules live HERE as data, never in code:
--   • MCA kinds      = 5, 6, 7   (stripped-down form)
--   • Special kinds  = 3, 4      (export; no invoice / applied-date)
--   • Type of Goods  = 3         (requires M3)
-- Editing these is a config change (a new seed row / UPDATE), not a code change.
--
-- All UPDATEs are scoped to the license page's accordions and are idempotent
-- (re-running just re-sets the same JSON).

DO $$
DECLARE
  v_page_id INT;
BEGIN
  SELECT id INTO v_page_id FROM "master_page_t" WHERE "slug" = 'license';
  IF v_page_id IS NULL THEN
    RAISE EXCEPTION 'license page not seeded — apply 0050 before 0057';
  END IF;

  -- Helper scope: every UPDATE below targets only fields under the license page.
  -- (Field `name` is unique within a page, so name-matching is unambiguous here.)

  -- ── Group A: hidden + not-required for MCA; shown + required otherwise ──
  -- bank, license-cleared-by, supplier, entry post, payment method, destination.
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"kind_id","nin":[5,6,7]},"requiredWhen":{"field":"kind_id","nin":[5,6,7]}}'::jsonb
   WHERE f."name" IN ('bank_id','license_cleared_by','supplier','entry_post_id','payment_method_id','destination_id')
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Group B: hidden for MCA, shown (optional) otherwise ──
  -- FSI/FSO, AUR, license file, payment subtype.
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"kind_id","nin":[5,6,7]}}'::jsonb
   WHERE f."name" IN ('fsi','aur','license_file','payment_subtype_id')
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Group C: always shown, but only required when NOT MCA ──
  -- weight, unit of measurement, FOB declared (MCA keeps these optional).
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"requiredWhen":{"field":"kind_id","nin":[5,6,7]}}'::jsonb
   WHERE f."name" IN ('weight','unit_of_measurement_id','fob_declared')
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Group D: hidden for MCA *and* Special; shown + required for standard ──
  -- invoice number, license applied date.
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"kind_id","nin":[5,6,7,3,4]},"requiredWhen":{"field":"kind_id","nin":[5,6,7,3,4]}}'::jsonb
   WHERE f."name" IN ('invoice_number','license_applied_date')
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Group D-opt: hidden for MCA *and* Special; shown (optional) for standard ──
  -- invoice file, REF. COD.
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"kind_id","nin":[5,6,7,3,4]}}'::jsonb
   WHERE f."name" IN ('invoice_file','ref_cod')
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Invoice date: same visibility as Group D, plus cannot be in the future ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"kind_id","nin":[5,6,7,3,4]},"requiredWhen":{"field":"kind_id","nin":[5,6,7,3,4]},"max":{"value":"today"}}'::jsonb
   WHERE f."name" = 'invoice_date'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── M3: shown + required only when Type of Goods = 3 AND not MCA ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"all":[{"field":"type_of_goods_id","eq":3},{"field":"kind_id","nin":[5,6,7]}]},"requiredWhen":{"all":[{"field":"type_of_goods_id","eq":3},{"field":"kind_id","nin":[5,6,7]}]}}'::jsonb
   WHERE f."name" = 'm3'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Validation date: hidden/optional for MCA; must be ≥ applied date ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"kind_id","nin":[5,6,7]},"requiredWhen":{"field":"kind_id","nin":[5,6,7]},"min":{"field":"license_applied_date"}}'::jsonb
   WHERE f."name" = 'license_validation_date'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Expiry date: hidden/optional for MCA; must be ≥ validation date ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"kind_id","nin":[5,6,7]},"requiredWhen":{"field":"kind_id","nin":[5,6,7]},"min":{"field":"license_validation_date"}}'::jsonb
   WHERE f."name" = 'license_expiry_date'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);
END $$;
