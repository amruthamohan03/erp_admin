-- Import Tracking attachments, and the licence's Global License beside its
-- invoice number.
--
-- 1. Four attachment columns on imports_t, each holding a files_t id like
--    license_t.license_file: insurance, inspection report, CRF and road
--    manifest.
-- 2. imports_t.license_file — a copy of the picked licence's global licence
--    file, filled by the same `fromRelated` licence derive that copies
--    license_invoice_number, and backfilled here for existing files.
-- 3. One field row per column in the Documentation accordion, each placed
--    directly after the field it documents. Placement is anchored on the
--    neighbour's CURRENT display_order rather than on fixed numbers, so an
--    environment whose layout was re-ordered still gets them in the right
--    place; the fields after the anchor move down one. Re-running is a no-op.

ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "license_file" varchar(255);
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "insurance_file" varchar(255);
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "crf_file" varchar(255);
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "inspection_file" varchar(255);
--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN IF NOT EXISTS "road_manif_file" varchar(255);
--> statement-breakpoint

UPDATE "imports_t" i
   SET "license_file" = l."license_file"
  FROM "license_t" l
 WHERE l."id" = i."license_id"
   AND i."license_file" IS NULL
   AND l."license_file" IS NOT NULL;
--> statement-breakpoint

DO $$
DECLARE
  d   record;
  acc integer;
  pos integer;
BEGIN
  FOR d IN
    SELECT * FROM (VALUES
      (1, 'license_file', 'license_invoice_number', 'Global License',
       '{"colSpan":"5-per-row"}'::jsonb, NULL,
       '{"kind":"fromRelated","source":"license","trigger":"license_id","column":"license_file"}'::jsonb),
      (2, 'crf_file', 'crf_received_date', 'CRF Attachment',
       '{"accept":".pdf,.jpg,.jpeg,.png","maxSizeKb":5120,"colSpan":"5-per-row"}'::jsonb, NULL, NULL),
      (3, 'insurance_file', 'insurance_reference', 'Insurance Attachment',
       '{"accept":".pdf,.jpg,.jpeg,.png","maxSizeKb":5120,"colSpan":"5-per-row"}'::jsonb, NULL, NULL),
      (4, 'inspection_file', 'inspection_reports', 'Inspection Report Attachment',
       '{"accept":".pdf,.jpg,.jpeg,.png","maxSizeKb":5120,"colSpan":"5-per-row"}'::jsonb, NULL, NULL),
      -- Shown for the same transport modes as the Road Manifest number itself.
      (5, 'road_manif_file', 'road_manif', 'Road Manifest Attachment',
       '{"accept":".pdf,.jpg,.jpeg,.png","maxSizeKb":5120,"colSpan":"5-per-row"}'::jsonb,
       '{"visibleWhen":{"in":[1,3],"field":"transport_mode"}}'::jsonb, NULL)
    ) AS v("seq", "name", "anchor", "label", "props", "conditions", "derive")
    ORDER BY "seq"
  LOOP
    SELECT f."accordion_id", f."display_order"
      INTO acc, pos
      FROM "master_page_accordion_field_t" f
      JOIN "master_page_accordion_t" a ON a."id" = f."accordion_id"
      JOIN "master_page_t" p ON p."id" = a."page_id"
     WHERE p."slug" = 'import' AND f."name" = d."anchor"
     ORDER BY f."display" DESC, f."id"
     LIMIT 1;

    -- No anchor (a stripped-down layout) or already added: leave it be.
    CONTINUE WHEN acc IS NULL;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM "master_page_accordion_field_t" x WHERE x."accordion_id" = acc AND x."name" = d."name");

    UPDATE "master_page_accordion_field_t"
       SET "display_order" = "display_order" + 1
     WHERE "accordion_id" = acc AND "display_order" > pos;

    INSERT INTO "master_page_accordion_field_t"
      ("accordion_id", "name", "label", "field_type", "required", "props", "conditions", "derive", "display_order", "display")
    VALUES (acc, d."name", d."label", 'file', false, d."props", d."conditions", d."derive", pos + 1, 'Y');
  END LOOP;
END $$;
