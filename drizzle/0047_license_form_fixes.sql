-- 0047 — License module form fixes (§4.1: the fixes are config rows, not code).
--
-- Six corrections to the License page's metadata and to the payment master data
-- it reads. Everything here is idempotent and safe to re-run.

--------------------------------------------------------------------------------
-- 1. Payment Method names were swapped against their modality codes.
--
-- payment_subtype_master_t holds the DRC "modalité de paiement" declaration codes,
-- which are authoritative reference data: 01-10 are EXPORTATION modalities and
-- 20-36 are IMPORTATION modalities. The two parent rows in payment_type_master_t
-- carried the opposite names — type 1 was called IMPORT while owning all ten
-- EXPORTATION codes, and type 2 called EXPORT while owning the IMPORTATION ones.
-- So the Payment Method dropdown named each group after the wrong direction.
--
-- Renaming the parents (rather than re-pointing 27 subtype FKs) keeps every
-- license_t.payment_method_id and payment_subtype_id value intact; only the label
-- shown for a given id changes. Matched on the current name so a database that was
-- already corrected by hand is left alone.
UPDATE "payment_type_master_t" SET "payment_type_name" = 'EXPORT'
 WHERE "id" = 1 AND "payment_type_name" = 'IMPORT';
UPDATE "payment_type_master_t" SET "payment_type_name" = 'IMPORT'
 WHERE "id" = 2 AND "payment_type_name" = 'EXPORT';

--------------------------------------------------------------------------------
-- The remaining changes all patch master_page_accordion_field_t rows on the
-- License page. Scoped by page slug + field name so they can't touch another
-- page's field of the same name.
--------------------------------------------------------------------------------

-- 2. Payment Subtype lists only the codes belonging to the chosen Payment Method.
--
-- `optionsParams` maps a query param to the form field supplying it, so the
-- renderer requests /api/v1/payment-subtypes?payment_type_id=<payment_method_id>.
-- The endpoint already accepts that filter; without this the field offered all 27
-- codes regardless of the method picked.
UPDATE "master_page_accordion_field_t" f
   SET "props" = COALESCE(f."props", '{}'::jsonb)
                 || '{"optionsParams": {"payment_type_id": "payment_method_id"}}'::jsonb
  FROM "master_page_accordion_t" a, "master_page_t" p
 WHERE f."accordion_id" = a."id" AND a."page_id" = p."id"
   AND p."slug" = 'license' AND f."name" = 'payment_subtype_id'
   AND COALESCE(f."props" -> 'optionsParams', 'null'::jsonb)
       IS DISTINCT FROM '{"payment_type_id": "payment_method_id"}'::jsonb;

-- 3. Supplier/Buyer sizes like every other field on its row.
--
-- It was the only field on the page with colSpan '12' (full width), which left it
-- stretched across the row while its neighbours sat at one fifth.
UPDATE "master_page_accordion_field_t" f
   SET "props" = COALESCE(f."props", '{}'::jsonb) || '{"colSpan": "5-per-row"}'::jsonb
  FROM "master_page_accordion_t" a, "master_page_t" p
 WHERE f."accordion_id" = a."id" AND a."page_id" = p."id"
   AND p."slug" = 'license' AND f."name" = 'supplier'
   AND COALESCE(f."props" ->> 'colSpan', '') IS DISTINCT FROM '5-per-row';

-- 4. License Cleared By defaults from the selected client.
--
-- clients carry a saved `license_cleared_by`; this fromRelated derive copies it
-- when client_id changes. `editable: true` keeps the field user-overridable per
-- licence (§4.12 — a derive without it renders read-only). The seed already ships
-- this; the statement exists to repair a database seeded before it was added or
-- edited through the page-builder.
UPDATE "master_page_accordion_field_t" f
   SET "derive" = '{"kind": "fromRelated", "column": "license_cleared_by", "source": "client", "trigger": "client_id", "editable": true}'::jsonb
  FROM "master_page_accordion_t" a, "master_page_t" p
 WHERE f."accordion_id" = a."id" AND a."page_id" = p."id"
   AND p."slug" = 'license' AND f."name" = 'license_cleared_by'
   AND COALESCE(f."derive" ->> 'source', '') IS DISTINCT FROM 'client';

-- 5. License Number is checked for uniqueness while it is typed.
--
-- license_t already carries a partial unique index on license_number, so a
-- duplicate was only caught at save time. `props.unique` names a resource under
-- /api/v1/uniqueness/{resource}; the field renderer debounces a check against it
-- and marks the input when the number is taken.
UPDATE "master_page_accordion_field_t" f
   SET "props" = COALESCE(f."props", '{}'::jsonb) || '{"unique": "license-numbers"}'::jsonb
  FROM "master_page_accordion_t" a, "master_page_t" p
 WHERE f."accordion_id" = a."id" AND a."page_id" = p."id"
   AND p."slug" = 'license' AND f."name" = 'license_number'
   AND COALESCE(f."props" ->> 'unique', '') IS DISTINCT FROM 'license-numbers';

-- 6. Destination/Origin can be added without leaving the form.
--
-- `quickAdd` turns a select into a select + "add" button: the renderer POSTs
-- { <field>: <typed value> } to the field's own options_source endpoint, then
-- selects the row it created. Config only — any select backed by a master with a
-- single-name create endpoint can opt in the same way.
UPDATE "master_page_accordion_field_t" f
   SET "props" = COALESCE(f."props", '{}'::jsonb)
                 || '{"quickAdd": {"field": "origin_name", "title": "Add Destination/Origin", "placeholder": "New destination/origin name"}}'::jsonb
  FROM "master_page_accordion_t" a, "master_page_t" p
 WHERE f."accordion_id" = a."id" AND a."page_id" = p."id"
   AND p."slug" = 'license' AND f."name" = 'destination_id'
   AND COALESCE(f."props" -> 'quickAdd', 'null'::jsonb) = 'null'::jsonb;
