-- §4.2/§4.12 — config-driven export CHARGE auto-calc for the Export Tracking form
-- (fields seeded in 0065). Replaces the legacy hardcoded math with `tiered` derive
-- config (see src/lib/pages/derive.ts). Every rate/threshold lives HERE as data:
--   • CEEC    : weight ≥ 30 → 800, else 600
--   • CGEA    : fixed 80
--   • OCC     : fixed 250
--   • LMC     : type_of_goods = 8 → weight × 8, else weight × 5
--   • OGEFREM : feet_container 1→50, 2/3→100, 4→150, 5→weight × 3
-- Editing a rate is an UPDATE here, never a code change. These fields render
-- read-only (any derive does) and are re-enforced server-side on save.
-- Scope: export page only. Idempotent.

DO $$
DECLARE
  v_page_id INT;
BEGIN
  SELECT id INTO v_page_id FROM "master_page_t" WHERE "slug" = 'export';
  IF v_page_id IS NULL THEN
    RAISE EXCEPTION 'export page not seeded — apply 0065 before 0069';
  END IF;

  -- CEEC: weight ≥ 30 → 800, else 600.
  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"tiered","rules":[{"when":{"not":{"field":"weight","lt":30}},"value":800}],"default":{"value":600}}'::jsonb
   WHERE f."name" = 'ceec_amount' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- CGEA: fixed 80.
  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"tiered","rules":[],"default":{"value":80}}'::jsonb
   WHERE f."name" = 'cgea_amount' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- OCC: fixed 250.
  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"tiered","rules":[],"default":{"value":250}}'::jsonb
   WHERE f."name" = 'occ_amount' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- LMC: type_of_goods = 8 → weight × 8, else weight × 5.
  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"tiered","base":"weight","rules":[{"when":{"field":"type_of_goods","eq":8},"rate":8}],"default":{"rate":5}}'::jsonb
   WHERE f."name" = 'lmc_amount' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- OGEFREM: by feet_container — 1→50, 2/3→100, 4→150, 5→weight × 3 (else untouched).
  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"tiered","base":"weight","rules":[
       {"when":{"field":"feet_container","eq":1},"value":50},
       {"when":{"field":"feet_container","in":[2,3]},"value":100},
       {"when":{"field":"feet_container","eq":4},"value":150},
       {"when":{"field":"feet_container","eq":5},"rate":3}
     ]}'::jsonb
   WHERE f."name" = 'ogefrem_amount' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);
END $$;
