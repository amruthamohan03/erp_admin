-- 0069 — PARTIELLE numbers carry REF COD, and money fields carry their currency.
--
-- ===========================================================================
-- 1. The PARTIELLE number is prefixed with the licence's REF. COD
-- ===========================================================================
--
-- 0065 shipped `{client}-{seq:3}` (TCL-001). The live operation issues
-- `{REF COD}-{seq:4}` — COD 2026 234480-0001 — and that is the right prefix:
-- an allotment belongs to a customs reference, and an operator matching a
-- PARTIELLE against its CRF document needs the two to share a prefix. REF. COD
-- and the CRF Reference are the same value.
--
-- `refcod` is a new segment type (src/lib/mcaRefFormat.ts) resolved from
-- license_t.ref_cod. Unlike the other code segments it is a full reference
-- rather than a short master code, so it is kept verbatim — spaces included —
-- and the sequence pattern escapes it before handing it to Postgres.
--
-- Rewritten ONLY where the row still holds exactly what 0065 inserted. Once an
-- operator has edited a format that row is their decision (§4.33) and a
-- migration must not overwrite it.
UPDATE mca_ref_format_master_t
   SET segments = '[{"type":"refcod"},{"type":"sequence","separator":"-","width":4}]'::jsonb,
       updated_at = now()
 WHERE target_key = 'partielle'
   AND segments = '[{"type":"client"},{"type":"sequence","separator":"-","width":3}]'::jsonb;

-- ===========================================================================
-- 2. A money field's currency follows the licence
-- ===========================================================================
--
-- FOB and R FOB rendered their currency as an empty dropdown, because nothing
-- ever supplied one: `currency` (the document currency) derives from the
-- selected licence, but the five per-amount currencies had no derive and no
-- default. An amount without a currency is not a smaller fact, it is an
-- ambiguous one — 50.00 of nothing.
--
-- Each now mirrors the licence's currency the way `currency` already does, and
-- is EDITABLE: an operator can quote freight in one currency and FOB in another,
-- which is the whole reason these are separate columns.
UPDATE master_page_accordion_field_t f
   SET derive = jsonb_build_object(
         'kind', 'fromRelated',
         'source', 'license',
         'column', 'currency_id',
         'trigger', 'license_id',
         -- A prefill the operator may override, not a read-only mirror.
         'editable', true),
       updated_at = now()
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id
 WHERE f.accordion_id = a.id
   AND p.slug = 'import'
   AND f.name IN ('fob_currency', 'r_fob_currency', 'fret_currency',
                  'other_charges_currency', 'insurance_amount_currency')
   AND f.derive IS NULL;

-- Existing rows: an amount already recorded keeps its currency ambiguous
-- forever otherwise, because an editable derive deliberately does not backfill
-- over a value an operator may have cleared. The document currency is the only
-- defensible answer, and it is what these columns already hold wherever they
-- were filled in at all.
UPDATE imports_t
   SET fob_currency = COALESCE(fob_currency, currency),
       r_fob_currency = COALESCE(r_fob_currency, currency),
       fret_currency = COALESCE(fret_currency, currency),
       other_charges_currency = COALESCE(other_charges_currency, currency),
       insurance_amount_currency = COALESCE(insurance_amount_currency, currency)
 WHERE currency IS NOT NULL
   AND (fob_currency IS NULL
     OR r_fob_currency IS NULL
     OR fret_currency IS NULL
     OR other_charges_currency IS NULL
     OR insurance_amount_currency IS NULL);
