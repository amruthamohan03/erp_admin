-- 0061 — Export Tracking's Remarks becomes a dated log, as Import's already is.
--
-- Export was the odd one out: one free-text box, so a consignment's history had
-- to be kept as a paragraph an operator appended to by hand, with no dates and
-- no way to tell one note from the next. Import was converted in 0059; this is
-- the same change on the other half of the pair, reusing the `remark-log` field
-- type and its "+" control rather than adding anything new (§4.5, §4.10).
--
-- Stored as JSONB on the row, like Import's, so the whole log is written inside
-- the page's single save transaction (§4.17).

-- STEP 1 — retype the column.
--
-- Free text already stored becomes the FIRST entry rather than being discarded.
-- Its date is unknown (the old column carried none), so the row's own loading
-- date is used, falling back to the creation date and then to today — always a
-- real date, never a fabricated one from an unrelated record.
--
-- A row already holding a JSON array is cast straight across; its keys are
-- normalised in step 2. The transform expression is deliberately free of
-- sub-selects: `ALTER COLUMN … USING` rejects them (SQLSTATE 0A000), which is
-- why the key rename cannot happen here.
ALTER TABLE "exports_t"
  ALTER COLUMN "remarks" TYPE jsonb
  USING (
    CASE
      WHEN "remarks" IS NULL OR btrim("remarks") = '' THEN '[]'::jsonb
      WHEN btrim("remarks") LIKE '[%' THEN btrim("remarks")::jsonb
      ELSE jsonb_build_array(
        jsonb_build_object(
          'date', to_char(
            COALESCE("loading_date", "created_at"::date, CURRENT_DATE),
            'YYYY-MM-DD'
          ),
          'remark', "remarks"
        )
      )
    END
  );

ALTER TABLE "exports_t" ALTER COLUMN "remarks" SET DEFAULT '[]'::jsonb;
UPDATE "exports_t" SET "remarks" = '[]'::jsonb WHERE "remarks" IS NULL;

-- STEP 2 — normalise the entry keys.
--
-- The legacy screen wrote `{"date":…,"text":…}`; RemarkLine and the renderer
-- expect `{"date":…,"remark":…}`. Rows converted from free text in step 1
-- already have the right shape and pass through this unchanged, so the statement
-- is safe to re-run.
UPDATE "exports_t" e
   SET "remarks" = x.fixed
  FROM (
    SELECT e2.id,
           jsonb_agg(
             jsonb_build_object(
               'date',   COALESCE(entry ->> 'date', ''),
               'remark', COALESCE(entry ->> 'remark', entry ->> 'text', '')
             )
             ORDER BY ord
           ) AS fixed
      FROM "exports_t" e2,
           LATERAL jsonb_array_elements(e2."remarks") WITH ORDINALITY AS t(entry, ord)
     WHERE jsonb_typeof(e2."remarks") = 'array'
       AND jsonb_array_length(e2."remarks") > 0
       AND jsonb_typeof(entry) = 'object'
     GROUP BY e2.id
  ) AS x
 WHERE e.id = x.id
   AND e."remarks" IS DISTINCT FROM x.fixed;

-- STEP 3 — point the field at the log renderer.
--
-- `rows`/`maxLength` described a textarea and no longer apply: the length limit
-- is per entry now, enforced by the Zod schema at the boundary, so they are
-- dropped rather than left to mislead.
UPDATE master_page_accordion_field_t f
   SET field_type = 'remark-log',
       props = (COALESCE(f.props, '{}'::jsonb) - 'maxLength' - 'rows')
               || '{"colSpan":"12"}'::jsonb,
       updated_at = now()
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id
 WHERE f.accordion_id = a.id
   AND p.slug = 'export'
   AND f.name = 'remarks';
