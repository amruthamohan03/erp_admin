-- Repair: Document 1 / Document 2 missing from the Payment Request form.
--
-- 0081 added both fields, but did it with a hardcoded `accordion_id = 27`,
-- hardcoded ids 306/307, and `ON CONFLICT (id) DO NOTHING`. All three are
-- assumptions about one particular database:
--
--   * if the payment page's `motif` accordion is not id 27 in a given database,
--     the rows attach to whatever accordion IS 27, or fail their foreign key;
--   * if id 306 or 307 was already taken by any other field, `DO NOTHING`
--     swallowed the insert and that document silently never appeared — which is
--     the reported symptom, one document present and the other absent.
--
-- This re-inserts them resolving the accordion BY SLUG and conflicting on the
-- real natural key, (accordion_id, name). Idempotent: a database where 0081
-- worked is left exactly as it is.
--
-- The conflict target is the COLUMN LIST, not the index's name. Drizzle declares
-- this key as `uniqueIndex('uq_master_page_accordion_field_t_acc_name')`, which
-- creates a unique INDEX and not a table constraint — and `ON CONFLICT ON
-- CONSTRAINT <name>` only resolves constraints, so naming it aborted the whole
-- chain with 42704 "constraint does not exist". The inferred form below matches
-- the index itself and works either way.
INSERT INTO "master_page_accordion_field_t"
  ("accordion_id", "name", "label", "field_type", "required", "props", "display_order", "display")
SELECT a."id", d."name", d."label", 'file', false,
       '{"accept":".pdf,.jpg,.jpeg,.png,.doc,.docx","maxSizeKb":5120,"colSpan":"3"}'::jsonb,
       d."ord", 'Y'
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id" AND p."slug" = 'payment'
  CROSS JOIN (VALUES
    ('file1_path', 'Document 1', 2),
    ('file2_path', 'Document 2', 3)
  ) AS d("name", "label", "ord")
 WHERE a."slug" = 'motif'
ON CONFLICT ("accordion_id", "name") DO NOTHING;
--> statement-breakpoint

-- A row 0081 placed on the WRONG accordion (whatever happened to be id 27) is
-- moved onto the real one rather than left as a stray field on another page.
-- Scoped to the two document names so nothing else can be dragged along.
UPDATE "master_page_accordion_field_t" f
   SET "accordion_id" = correct."id", "updated_at" = now()
  FROM (
    SELECT a."id"
      FROM "master_page_accordion_t" a
      JOIN "master_page_t" p ON p."id" = a."page_id" AND p."slug" = 'payment'
     WHERE a."slug" = 'motif'
  ) AS correct
 WHERE f."name" IN ('file1_path', 'file2_path')
   AND f."accordion_id" <> correct."id"
   AND NOT EXISTS (
     SELECT 1 FROM "master_page_accordion_field_t" x
      WHERE x."accordion_id" = correct."id" AND x."name" = f."name"
   );
--> statement-breakpoint

-- A field that exists but was switched OFF renders nowhere, and the insert above
-- cannot fix that: `ON CONFLICT DO NOTHING` leaves the existing row exactly as
-- it is, `display = 'N'` and all. Re-enabling is safe here because these two
-- fields are meant to be on the form — that is the whole point of this file.
UPDATE "master_page_accordion_field_t" f
   SET "display" = 'Y', "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id"
   AND p."slug" = 'payment'
   AND a."slug" = 'motif'
   AND f."name" IN ('file1_path', 'file2_path')
   AND f."display" <> 'Y';
--> statement-breakpoint

-- Motif shares its row with the two documents (half + quarter + quarter), which
-- 0081 also set and which is lost if its own update did not apply.
UPDATE "master_page_accordion_field_t" f
   SET "props" = jsonb_set(COALESCE(f."props", '{}'::jsonb), '{colSpan}', '"6"'::jsonb),
       "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id" AND p."slug" = 'payment'
 WHERE f."accordion_id" = a."id"
   AND a."slug" = 'motif'
   AND f."name" = 'motif'
   AND COALESCE(f."props" ->> 'colSpan', '12') = '12';
