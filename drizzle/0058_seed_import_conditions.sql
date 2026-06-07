-- §4.12 — config-driven conditional logic for the Import Tracking form (fields
-- seeded in 0052). Mirrors the source PHP form's transport-mode / type-of-goods /
-- kind / clearance show-hide, conditional-required, and date-sequence rules.
--
-- Business IDs live HERE as data, never in code:
--   • Transport mode: 1 = Road, 2 = Air, 3 = Rail, 4 = Lake
--   • Type of Goods : 3 = Liquid (M3 + Cession Date)
--   • Kind          : 1 = Import Definitive, 2 = Import Temporary
--   • Clearance     : 3 = Transfer (T1 fields)
-- Editing these is a config change (UPDATE here), not a code change.
--
-- Scope: only the import page's fields. Idempotent (re-running re-sets the JSON).
--
-- NOT covered here (these compute/fetch values, not gate fields — a separate
-- derive layer): MCA auto-generation, Document-Status auto, "from license"
-- autofill, remaining weight/FOB/M3, clearing-status suggestion, bulk update.

DO $$
DECLARE
  v_page_id INT;
BEGIN
  SELECT id INTO v_page_id FROM "master_page_t" WHERE "slug" = 'import';
  IF v_page_id IS NULL THEN
    RAISE EXCEPTION 'import page not seeded — apply 0052 before 0058';
  END IF;

  -- Helper: every UPDATE below is scoped to fields under the import page.
  -- (Field `name` is unique within a page.)

  -- ── Unconditional requireds (PHP validateImportData) not already flagged ──
  UPDATE "master_page_accordion_field_t" f
     SET "required" = true
   WHERE f."name" IN ('regime','types_of_clearance','commodity','entry_point_id')
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── AIR-only fields: shown only when Transport Mode = Air (2) ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"transport_mode","eq":2}}'::jsonb
   WHERE f."name" IN ('airport_arrival_date','operating_company','operating_days','operating_amount','airway_bill','airway_bill_weight')
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- Dispatch from Airport: Air-only AND must be ≥ Airport Arrival.
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"transport_mode","eq":2},"min":{"field":"airport_arrival_date"}}'::jsonb
   WHERE f."name" = 'dispatch_from_airport'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── ROAD-only fields: Transport Mode = Road (1) ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"transport_mode","eq":1}}'::jsonb
   WHERE f."name" IN ('horse','trailer_1','trailer_2')
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── RAIL-only field: Transport Mode = Rail (3) ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"transport_mode","eq":3}}'::jsonb
   WHERE f."name" = 'wagon'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Road manifest: Road or Rail (1,3) ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"transport_mode","in":[1,3]}}'::jsonb
   WHERE f."name" = 'road_manif'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Container + all Routing & Warehouse fields: any mode EXCEPT Air (≠2) ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"transport_mode","neq":2}}'::jsonb
   WHERE f."name" IN ('container','arrival_date_zambia','kanyaka_arrival_date','kanyaka_dispatch_date',
                      'warehouse_arrival_date','warehouse_departure_date','dispatch_deliver_date',
                      'ibs_coupon_reference','border_warehouse_id','entry_coupon','bonded_warehouse_id','truck_status')
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Routing date-sequence: visible (≠ Air) AND each ≥ the previous leg ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"transport_mode","neq":2},"min":{"field":"arrival_date_zambia"}}'::jsonb
   WHERE f."name" = 'dispatch_from_zambia'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"transport_mode","neq":2},"min":{"field":"dispatch_from_zambia"}}'::jsonb
   WHERE f."name" = 'drc_entry_date'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"transport_mode","neq":2},"min":{"field":"drc_entry_date"}}'::jsonb
   WHERE f."name" = 'border_warehouse_arrival_date'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"transport_mode","neq":2},"min":{"field":"border_warehouse_arrival_date"}}'::jsonb
   WHERE f."name" = 'dispatch_from_border'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Liquid (Type of Goods = 3): M3 + Cession Date ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"type_of_goods","eq":3}}'::jsonb
   WHERE f."name" IN ('m3','cession_date')
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Declaration Validity: only for Import Temporary (Kind = 2) ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"kind","eq":2}}'::jsonb
   WHERE f."name" = 'declaration_validity'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── T1 fields: Transfer clearance (3) AND not Air ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"all":[{"field":"types_of_clearance","eq":3},{"field":"transport_mode","neq":2}]}}'::jsonb
   WHERE f."name" IN ('t1_number','t1_date')
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Dates that must be ≥ Pre-Alert Date ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"min":{"field":"pre_alert_date"}}'::jsonb
   WHERE f."name" IN ('crf_received_date','ad_date','insurance_date','audited_date','archived_date')
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Inspection Reports (PARTIELLE): required for Import Definitive/Temporary (1,2) ──
  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"requiredWhen":{"field":"kind","in":[1,2]}}'::jsonb
   WHERE f."name" = 'inspection_reports'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);
END $$;
