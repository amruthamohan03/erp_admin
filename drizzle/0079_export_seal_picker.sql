-- Wire the DGDA seal picker into the single-record export form (runtime), matching
-- the bulk grid: dgda_seal_no becomes a 'seal-picker' field, number_of_seals
-- auto-counts from it (count derive, read-only), and both show only for Road
-- (transport_mode = 1). Scope: export page only. Idempotent.

-- Allow the new field type past the field_type CHECK constraint (from 0039).
ALTER TABLE "master_page_accordion_field_t" DROP CONSTRAINT IF EXISTS "master_page_accordion_field_t_field_type_check";
--> statement-breakpoint
ALTER TABLE "master_page_accordion_field_t" ADD CONSTRAINT "master_page_accordion_field_t_field_type_check"
  CHECK ("field_type" IN ('text','textarea','email','tel','number','date','select','checkbox-group','file','seal-picker'));
--> statement-breakpoint

DO $$
DECLARE
  v_page_id INT;
BEGIN
  SELECT id INTO v_page_id FROM "master_page_t" WHERE "slug" = 'export';
  IF v_page_id IS NULL THEN
    RAISE EXCEPTION 'export page not seeded — apply 0065 before 0079';
  END IF;

  UPDATE "master_page_accordion_field_t" f
     SET "field_type" = 'seal-picker',
         "conditions" = '{"visibleWhen":{"field":"transport_mode","eq":1}}'::jsonb
   WHERE f."name" = 'dgda_seal_no'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f
     SET "conditions" = '{"visibleWhen":{"field":"transport_mode","eq":1}}'::jsonb,
         "derive" = '{"kind":"count","field":"dgda_seal_no"}'::jsonb
   WHERE f."name" = 'number_of_seals'
     AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);
END $$;
