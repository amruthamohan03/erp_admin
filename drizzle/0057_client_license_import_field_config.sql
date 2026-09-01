-- 0057 — the field-level corrections for Client, License and Import Tracking.
--
-- All of this is configuration (§4.1): rows in master_page_accordion_field_t, not
-- code. Migration 0056 created the masters and columns these point at.
--
-- Written as UPDATEs keyed on (page slug, field name) so re-running is harmless
-- and so a field that has since been renamed fails loudly rather than silently
-- updating nothing of consequence.

-- Resolve a field id from its page slug + column name.
CREATE OR REPLACE FUNCTION pg_temp.field_id(p_slug text, p_name text) RETURNS integer AS $$
  SELECT f.id
    FROM master_page_accordion_field_t f
    JOIN master_page_accordion_t a ON a.id = f.accordion_id
    JOIN master_page_t p ON p.id = a.page_id
   WHERE p.slug = p_slug AND f.name = p_name
   LIMIT 1;
$$ LANGUAGE sql;

-- ===========================================================================
-- CLIENT
-- ===========================================================================

-- Location reads the Main Office master (its FK was retargeted in 0056).
UPDATE master_page_accordion_field_t
   SET options_source = 'main-offices',
       options_label_field = 'main_location_name'
 WHERE id = pg_temp.field_id('clients', 'office_location_id');

-- Client Code gains the live duplicate check. `props.unique` names a resource
-- under /api/v1/uniqueness/{resource}; 'client-codes' already checks short_name,
-- so this is purely turning the existing mechanism on for this field (§4.10).
UPDATE master_page_accordion_field_t
   SET props = COALESCE(props, '{}'::jsonb) || '{"unique":"client-codes"}'::jsonb
 WHERE id = pg_temp.field_id('clients', 'short_name');

-- Payment Term moves from five hardcoded options to the master. The field is
-- repointed at the new payment_term_id column so it stores an id like every
-- other master-backed select.
UPDATE master_page_accordion_field_t
   SET name = 'payment_term_id',
       options_static = NULL,
       options_source = 'payment-terms',
       options_label_field = 'payment_term_name'
 WHERE id = pg_temp.field_id('clients', 'payment_term');

-- Verified By / Approved By prefill the signed-in user, and their dates today.
-- `editable: true` keeps them changeable — this is a convenience, not a lock
-- (see the note in derive.ts on prefill-style derives).
UPDATE master_page_accordion_field_t
   SET derive = '{"kind":"fromRelated","source":"session","column":"user_id","trigger":[],"editable":true}'::jsonb
 WHERE id IN (pg_temp.field_id('clients', 'verified_by_id'),
              pg_temp.field_id('clients', 'approved_by_id'));

UPDATE master_page_accordion_field_t
   SET derive = '{"kind":"fromRelated","source":"session","column":"today","trigger":[],"editable":true}'::jsonb
 WHERE id IN (pg_temp.field_id('clients', 'verified_by_date'),
              pg_temp.field_id('clients', 'approved_by_date'));

-- ===========================================================================
-- LICENSE
-- ===========================================================================

-- Payment Method now reads the real master instead of payment_type_master_t,
-- which offered only "EXPORT" and "IMPORT".
UPDATE master_page_accordion_field_t
   SET options_source = 'payment-methods',
       options_label_field = 'payment_method_name'
 WHERE id = pg_temp.field_id('license', 'payment_method_id');

-- The MCA reference is captured on the licence, which is what lets Import
-- Tracking narrow Client → MCA Reference → License.
INSERT INTO master_page_accordion_field_t
  (accordion_id, name, label, field_type, required, props, display_order, display, created_by, updated_by)
SELECT a.id, 'mca_ref', 'MCA Reference', 'text', false,
       '{"colSpan":"5-per-row","maxLength":100}'::jsonb,
       COALESCE((SELECT MAX(f.display_order) FROM master_page_accordion_field_t f
                  WHERE f.accordion_id = a.id), 0) + 1,
       'Y', 1, 1
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id
 WHERE p.slug = 'license' AND a.slug = 'license-details'
   AND NOT EXISTS (SELECT 1 FROM master_page_accordion_field_t f
                    WHERE f.accordion_id = a.id AND f.name = 'mca_ref');

-- ===========================================================================
-- IMPORT TRACKING
-- ===========================================================================

-- NOT INCLUDED: turning Import's MCA Reference into a picker.
--
-- It is currently auto-GENERATED from the chosen licence
--   {client_short}-{kind_short}{goods_short}{transport_letter}{year}-{seq}
-- triggered by license_id, and export tracking generates its reference the same
-- way. Making it a dropdown that narrows the licence is the exact inverse of
-- that, and would leave nothing producing the sequence number. Which direction
-- wins is a business decision, so it is deliberately not bundled here.

-- The three currency fields follow the licence's own currency once it is chosen.
-- `editable` because a consignment may legitimately differ from the licence.
UPDATE master_page_accordion_field_t
   SET derive = '{"kind":"fromRelated","source":"license","column":"currency_id","trigger":"license_id","editable":true}'::jsonb
 WHERE id IN (pg_temp.field_id('import', 'fret_currency'),
              pg_temp.field_id('import', 'other_charges_currency'),
              pg_temp.field_id('import', 'insurance_amount_currency'));

-- Clearing Based On becomes a master-backed dropdown (column renamed in 0056).
UPDATE master_page_accordion_field_t
   SET name = 'clearing_basis_id',
       label = 'Clearing Based On',
       field_type = 'select',
       options_source = 'clearing-bases',
       options_label_field = 'clearing_basis_name'
 WHERE id = pg_temp.field_id('import', 'clearing_based_on');

-- Truck Status likewise — the master already existed, the field was free text.
UPDATE master_page_accordion_field_t
   SET name = 'truck_status_id',
       field_type = 'select',
       options_source = 'truck-statuses',
       options_label_field = 'truck_status'
 WHERE id = pg_temp.field_id('import', 'truck_status');

-- Commodity gains the green "+" so a missing commodity can be added without
-- leaving the consignment. Same mechanism the License page's Destination uses.
UPDATE master_page_accordion_field_t
   SET props = COALESCE(props, '{}'::jsonb)
               || '{"quickAdd":{"field":"commodity_name","title":"Add Commodity","placeholder":"New commodity name"}}'::jsonb
 WHERE id = pg_temp.field_id('import', 'commodity');
