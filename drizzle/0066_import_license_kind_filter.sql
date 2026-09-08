-- 0066 — Import Tracking's licence picker offers only import-kind licences.
--
-- The field used to list every licence the client holds, so an operator could
-- attach an EXPORT DEFINITVE licence to an import file. The reference generator
-- would then build an MCA ref carrying an export kind code, and the licence's
-- weight/FOB would be drawn down from the wrong side of the business.
--
-- Scoped by the KIND'S OWN FLAG, never by an id list (§4.1):
-- kind_master_t.use_for_import is already true for exactly IMPORT DEFINITVE and
-- IMPORT TEMPORARY (migration 0062), so re-classifying a kind — or adding a new
-- import kind — is a master edit and not a deploy.
--
-- `optionsFilters` is the literal-valued sibling of `optionsParams`: the latter
-- reads a query parameter off another form field, this one pins it to a constant.
-- The narrowing is a property of the FIELD (a licence picker on an import page),
-- not of anything the operator has typed.
--
-- An existing import that already points at a non-import licence keeps its value:
-- SearchableSelect surfaces a value that is not in its list rather than silently
-- showing the placeholder, so the mismatch is visible instead of being erased on
-- the next save.
UPDATE master_page_accordion_field_t f
   SET props = COALESCE(f.props, '{}'::jsonb)
               || '{"optionsFilters":{"use_for":"import"}}'::jsonb,
       updated_at = now()
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id
 WHERE f.accordion_id = a.id
   AND p.slug = 'import'
   AND f.name = 'license_id';
