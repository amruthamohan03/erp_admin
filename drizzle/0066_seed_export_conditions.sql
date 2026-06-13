-- §4.12 — config-driven conditional logic for the Export Tracking form (fields
-- seeded in 0065). Mirrors the legacy export form's transport-mode show/hide and
-- date-sequence rules.
--
-- Business IDs live HERE as data, never in code (same as imports, 0058):
--   • Transport mode: 1 = Road, 2 = Air, 3 = Rail
-- Editing these is a config change (UPDATE here), not a code change.
-- Scope: export page only. Idempotent.

DO $$
DECLARE
  v_page_id INT;
BEGIN
  SELECT id INTO v_page_id FROM "master_page_t" WHERE "slug" = 'export';
  IF v_page_id IS NULL THEN
    RAISE EXCEPTION 'export page not seeded — apply 0065 before 0066';
  END IF;

  -- ── ROAD-only fields: Transport Mode = Road (1) ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"transport_mode","eq":1}}'::jsonb
   WHERE f."name" IN ('horse','trailer_1','trailer_2')
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── WAGON / Airway Bill: Air or Rail (2,3) ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"transport_mode","in":[2,3]}}'::jsonb
   WHERE f."name" = 'wagon_ref'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Date-pair sequences: the *_out date cannot precede its *_in date ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"min":{"field":"ceec_in_date"}}'::jsonb
   WHERE f."name" = 'ceec_out_date'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"min":{"field":"min_div_in_date"}}'::jsonb
   WHERE f."name" = 'min_div_out_date'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"min":{"field":"gov_docs_in_date"}}'::jsonb
   WHERE f."name" = 'gov_docs_out_date'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);
END $$;
