-- 0059 — Import Tracking's Remarks becomes a dated log rather than one textarea.
--
-- Each entry carries its own date, so the sequence of what happened to a
-- consignment is readable instead of being buried in one paragraph.
--
-- Stored as JSONB on the row, the same way the payment request's MCA lines are
-- (`mca_data` + the `mca-grid` field type). A child table would need its own
-- routes and would sit outside the page's single save transaction (§4.17); as a
-- column the whole log is written with everything else. The column was already
-- documented as "JSON array of remarks (kept as text to mirror the source column
-- type)" — this is that intent finally realised.

-- Allow the new field type. A CHECK constraint cannot be extended in place, so
-- the whole list is restated — keep it in sync with FieldType in
-- src/types/index.ts (see 0048, which did the same for 'mca-grid').
ALTER TABLE "master_page_accordion_field_t"
  DROP CONSTRAINT IF EXISTS master_page_accordion_field_t_field_type_check;
ALTER TABLE "master_page_accordion_field_t"
  ADD CONSTRAINT master_page_accordion_field_t_field_type_check
  CHECK (field_type IN (
    'text','textarea','email','tel','number','date','select',
    'checkbox-group','file','seal-picker','remark-log','partielle-picker','mca-grid'
  ));

-- Free text already stored becomes the FIRST entry rather than being discarded.
-- Its date is unknown (the old column carried none), so the row's own pre-alert
-- date is used, falling back to the creation date and then to today — always a
-- real date, never a fabricated one from an unrelated record.
ALTER TABLE "imports_t"
  ALTER COLUMN "remarks" TYPE jsonb
  USING (
    CASE
      WHEN "remarks" IS NULL OR btrim("remarks") = '' THEN '[]'::jsonb
      -- Already JSON from an earlier import? Keep it as-is.
      WHEN btrim("remarks") LIKE '[%' THEN
        COALESCE(NULLIF(btrim("remarks"), '')::jsonb, '[]'::jsonb)
      ELSE jsonb_build_array(
        jsonb_build_object(
          'date', to_char(
            COALESCE("pre_alert_date", "created_at"::date, CURRENT_DATE),
            'YYYY-MM-DD'
          ),
          'remark', "remarks"
        )
      )
    END
  );

ALTER TABLE "imports_t" ALTER COLUMN "remarks" SET DEFAULT '[]'::jsonb;
UPDATE "imports_t" SET "remarks" = '[]'::jsonb WHERE "remarks" IS NULL;

-- Point the field at the new renderer. `maxLength` no longer applies to the
-- field as a whole (it is per entry, enforced by the Zod schema), so it is
-- dropped from props rather than left to mislead.
UPDATE master_page_accordion_field_t f
   SET field_type = 'remark-log',
       props = (COALESCE(f.props, '{}'::jsonb) - 'maxLength' - 'rows')
               || '{"colSpan":"12"}'::jsonb
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id
 WHERE a.id = f.accordion_id
   AND p.slug = 'import'
   AND f.name = 'remarks';
