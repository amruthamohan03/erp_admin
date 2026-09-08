-- 0065 — three Import Tracking corrections.
--
--   1. The PARTIELLE (inspection report) number becomes a configured reference.
--   2. Type of Clearance opens on DECLARATION for a new import.
--
-- ===========================================================================
-- 1. PARTIELLE numbers are generated, not typed
-- ===========================================================================
--
-- The management dialog built its own number at the call site —
-- `{client ref}-{rows.length + 1}` zero-padded to four — and only ever showed it
-- as PLACEHOLDER text, so an operator saw a suggestion, pressed Save, and the
-- create returned silently because the field was empty.
--
-- Three things were wrong beyond that: the width did not match what the
-- operation has on file (TCL-001, three digits), `rows.length + 1` collides with
-- a live name as soon as an allotment is deleted, and a reference assembled in
-- code is exactly what §4.33 exists to prevent.
--
-- `partielle` is now the seventh entry in the vetted registry
-- (src/db/queries/mcaRefGenerator.ts), which owns the table/column it writes to
-- (partial_t.partial_name) and the SQL that reads its client code. The CHECK is
-- a closed set and cannot be extended in place, so it is restated whole.
ALTER TABLE "mca_ref_format_master_t"
  DROP CONSTRAINT IF EXISTS "mca_ref_format_master_t_target_key_check";

ALTER TABLE "mca_ref_format_master_t"
  ADD CONSTRAINT "mca_ref_format_master_t_target_key_check" CHECK ("target_key" IN (
    'import','export','license','local','export-invoice','import-invoice','partielle'
  ));

-- Numbered per CLIENT across every licence, not per licence: an import links to
-- its allotment by name (imports_t.inspection_reports), so the name has to be
-- unique app-wide. `partial_t.partial_name` already carries a unique index.
--
-- DO NOTHING, not DO UPDATE — this row is the operator's decision once it exists
-- (§4.33), and re-running must not put the shipped format back over an edit.
INSERT INTO "mca_ref_format_master_t" ("target_key", "format_name", "segments")
VALUES (
  'partielle',
  'PARTIELLE (Inspection Report) — PARTIELLE Number',
  '[{"type":"client"},{"type":"sequence","separator":"-","width":3}]'::jsonb
)
ON CONFLICT ("target_key") DO NOTHING;

-- ===========================================================================
-- 2. Type of Clearance defaults to DECLARATION
-- ===========================================================================
--
-- `props.defaultValue` is read by TransactionalPage when a NEW record opens and
-- the field is blank. Never applied to an existing record: a stored blank is a
-- decision, and stamping a default over it on open would rewrite history on the
-- next save.
--
-- The id is resolved from the master's own text rather than written as a literal
-- — ids are assigned by the seed and differ between installations (§4.1). No
-- DECLARATION row ⇒ no default, rather than a default pointing at nothing.
UPDATE master_page_accordion_field_t f
   SET props = COALESCE(f.props, '{}'::jsonb)
               || jsonb_build_object('defaultValue', c.id::text),
       updated_at = now()
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id,
       clearance_master_t c
 WHERE f.accordion_id = a.id
   AND p.slug = 'import'
   AND f.name = 'types_of_clearance'
   AND c.display = 'Y'
   AND upper(btrim(c.clearance_name)) = 'DECLARATION';
