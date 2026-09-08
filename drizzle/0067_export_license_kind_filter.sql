-- 0067 — Export Tracking's licence picker offers only export-kind licences.
--
-- The twin of 0066, which did the same for Import Tracking. Both sides now ask
-- the KIND for permission rather than carrying a list of ids:
--
--   use_for_import  →  IMPORT DEFINITVE, IMPORT TEMPORARY
--   use_for_export  →  IMPORT TEMPORARY, EXPORT DEFINITVE, EXPORT TEMPORARY
--
-- IMPORT TEMPORARY appears on BOTH by design — a temporary import leaves again
-- as a re-export, which is why the classification had to become a flag on the
-- kind rather than something inferred from its name (migration 0062).
--
-- Unfiltered, an operator could attach an import-only licence to an export: the
-- generated MCA reference would carry an import kind code (§4.33) and the
-- licence's weight/FOB would be drawn down from the wrong side of the business.
--
-- An export already pointing at a non-export licence keeps its value —
-- SearchableSelect surfaces a value missing from its list instead of falling
-- back to the placeholder, so the mismatch is visible rather than erased on the
-- next save.
UPDATE master_page_accordion_field_t f
   SET props = COALESCE(f.props, '{}'::jsonb)
               || '{"optionsFilters":{"use_for":"export"}}'::jsonb,
       updated_at = now()
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id
 WHERE f.accordion_id = a.id
   AND p.slug = 'export'
   AND f.name = 'license_id';
