-- 0063 — three field-configuration corrections on the tracking pages.
--
-- All three are `master_page_accordion_field_t` edits: what a form shows and how
-- it collects a value is config (§4.12), so none of this needs a code change.

-- ── 1. License → MCA Reference is no longer typed by hand ──────────────────
--
-- §4.33 made every reference the generator's business; a hand-typed one on the
-- Licence form is a second, competing source for the same value. Hidden rather
-- than deleted: license_t.mca_ref still holds what was entered historically, and
-- Import Tracking's Client → MCA Reference → License cascade still reads it.
UPDATE master_page_accordion_field_t f
   SET display = 'N', updated_at = now()
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id
 WHERE f.accordion_id = a.id
   AND p.slug = 'license'
   AND f.name = 'mca_ref';

-- ── 2. Import → Partial is removed ────────────────────────────────────────
--
-- Hidden, not dropped: imports_t.partial_id keeps its existing values and its FK,
-- so nothing already recorded is lost and the column can be re-surfaced by
-- flipping this back.
UPDATE master_page_accordion_field_t f
   SET display = 'N', updated_at = now()
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id
 WHERE f.accordion_id = a.id
   AND p.slug = 'import'
   AND f.name = 'partial_id';

-- ── 3. Import → Operating Company becomes a dropdown ──────────────────────
--
-- Free text meant every operator spelled the same company differently, and
-- nothing could be grouped or reported on. Backed by group_company_master_t.
--
-- The column stays varchar and keeps storing the NAME rather than an id: that is
-- what it already holds, so no data has to be migrated and no report that reads
-- it has to change. `options_value_field` tells the renderer to submit the label
-- instead of the row id.
UPDATE master_page_accordion_field_t f
   SET field_type = 'select',
       options_source = 'group-companies',
       options_label_field = 'group_company_name',
       props = COALESCE(f.props, '{}'::jsonb) || '{"optionsValueField":"group_company_name"}'::jsonb,
       updated_at = now()
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id
 WHERE f.accordion_id = a.id
   AND p.slug = 'import'
   AND f.name = 'operating_company';
