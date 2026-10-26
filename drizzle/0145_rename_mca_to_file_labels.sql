-- Rename "MCA" to "File" in every label an operator reads that lives in the
-- database rather than in source — page field labels ("MCA Reference" →
-- "File Reference", "MCA LT Reference" → "File LT Reference"), section and page
-- titles, menu names, reference-format names ("Import Tracking — MCA
-- Reference"), invoice grid headings, dashboard cards, and the other masters'
-- name/label columns.
--
-- Display text only. Identifiers are NOT renamed: columns (mca_ref,
-- mca_lt_reference), table names (mca_ref_format_master_t), segment type keys
-- ("mca") and stored reference VALUES stay exactly as they are, so no record,
-- reference or URL changes.
--
-- Whole word, upper case only (\mMCA\M), so `mca_ref`-style keys and words that
-- merely contain the letters are untouched. "MCA File" would otherwise become
-- "File File", so that pair collapses afterwards.
--
-- Each table/column is checked for existence first — not every database carries
-- every master — and the UPDATE only touches rows that contain the word, so this
-- is safe to re-run.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN (VALUES
        ('master_page_t', 'title'),
        ('master_page_accordion_t', 'title'),
        ('master_page_accordion_field_t', 'label'),
        ('menu_master_t', 'menu_name'),
        ('mca_ref_format_master_t', 'format_name'),
        ('invoice_grid_heading_master_t', 'heading'),
        ('dashboard_card_master_t', 'card_title'),
        ('dashboard_card_master_t', 'card_subtitle'),
        ('master_bulk_filter_t', 'label'),
        ('delay_rule_master_t', 'name'),
        ('delay_rule_stage_t', 'label'),
        ('report_definition_master_t', 'name'),
        ('report_definition_master_t', 'description'),
        ('notification_event_master_t', 'name'),
        ('form_field_master_t', 'label'),
        ('import_target_master_t', 'name'),
        ('payment_stage_master_t', 'label'),
        ('status_master_t', 'name'),
        ('document_type_master_t', 'name'),
        ('document_type_master_t', 'description')
      ) AS t(table_name, column_name)
        ON t.table_name = c.table_name AND t.column_name = c.column_name
     WHERE c.table_schema = 'public'
  LOOP
    EXECUTE format(
      'UPDATE %I SET %I = regexp_replace(regexp_replace(%I, ''\mMCA\M'', ''File'', ''g''), ''\mFile (Files?)\M'', ''\1'', ''g'') WHERE %I ~ ''\mMCA\M''',
      target.table_name, target.column_name, target.column_name, target.column_name
    );
  END LOOP;
END $$;
