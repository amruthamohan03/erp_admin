-- 0070 — PARTIELLE (inspection-report) allocation reaches Export Tracking.
--
-- Allotments were an import-only idea: a licence's weight/FOB budget was cut
-- into named allotments and only imports_t drew on them. But a licence is drawn
-- down by exports as well (that is why the remaining figures count both — see
-- src/lib/pages/deriveSources.ts), so an allotment that ignored exports reported
-- more room than it had.
--
-- Same model on both sides, deliberately: linked by NAME
-- (partial_t.partial_name), same column name and width as the import twin, so
-- ONE allocation service serves both rather than a second parallel one (§4.10).

ALTER TABLE "exports_t" ADD COLUMN IF NOT EXISTS "inspection_reports" varchar(100);

-- Queried by name whenever an allotment's usage is rolled up, exactly as on the
-- import side.
CREATE INDEX IF NOT EXISTS "idx_exports_t_inspection_reports"
  ON "exports_t" ("inspection_reports");

-- The picker, on the export Documentation accordion beside the weight and FOB it
-- constrains. `partielle-picker` is the same field type the import form uses; it
-- scopes its options to the selected licence and carries the gear that opens
-- PARTIELLE Management.
INSERT INTO master_page_accordion_field_t
  (accordion_id, name, label, field_type, required, options_source, options_label_field,
   props, display_order, display, created_by, updated_by)
SELECT a.id, 'inspection_reports', 'Inspection Reports', 'partielle-picker', false,
       NULL, NULL,
       '{"colSpan":"5-per-row","optionsParams":{"license_id":"license_id"}}'::jsonb,
       -- Immediately after FOB (15): the allotment is what the weight and FOB
       -- are checked against, so it reads next to them.
       16, 'Y', 1, 1
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id
 WHERE p.slug = 'export' AND a.slug = 'documentation'
   AND NOT EXISTS (
     SELECT 1 FROM master_page_accordion_field_t f
      WHERE f.accordion_id = a.id AND f.name = 'inspection_reports');

-- Everything at or after that position shifts down one so the order stays a
-- sequence rather than acquiring a duplicate.
UPDATE master_page_accordion_field_t f
   SET display_order = f.display_order + 1, updated_at = now()
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id
 WHERE f.accordion_id = a.id
   AND p.slug = 'export' AND a.slug = 'documentation'
   AND f.name <> 'inspection_reports'
   AND f.display_order >= 16;
