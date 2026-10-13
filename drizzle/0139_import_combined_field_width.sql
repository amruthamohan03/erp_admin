-- Import Tracking: the combined amount+currency fields take a standard cell.
--
-- Five fields in Import Tracking → Documentation are "combined" — an amount
-- welded to its currency select in one cell (§4.1, via `props.currencyField`) —
-- and each was laid out at `2-of-5`, two fifths of the row. Beside the
-- single-cell fields around them they read as double-length, which is the
-- complaint: every input on the page should be one width.
--
--   fret · other_charges · insurance_amount · r_fob · fob
--
-- A standard cell fits the pair. `.input-group` is a gapless flex whose halves
-- overlap by a pixel, so the cell needs the amount's `min-w-[4rem]` floor plus
-- the currency's fixed `w-24` — about 159px — and a `5-per-row` cell is wider
-- than that at every breakpoint the class steps through (w-full → md:w-1/2 →
-- lg:w-1/3 → xl:w-1/5). The amount keeps its floor, so it cannot collapse to
-- the spinner-with-no-digits state that floor was added to prevent.
--
-- `inspection_reports` KEEPS `2-of-5`, as asked. It is not an amount pair but a
-- picker carrying a manage button, and a single cell left its dropdown narrower
-- than the list's own minimum width, so the list opened over the next field
-- (§4.36 — the reason `2-of-5` exists at all).
--
-- Matched on the fields that actually carry a currency companion rather than on
-- a list of names, so a sixth pair added to this accordion tomorrow is already
-- consistent and this cannot silently catch the picker.
UPDATE master_page_accordion_field_t f
   SET props = jsonb_set(f.props, '{colSpan}', '"5-per-row"'),
       updated_at = now()
 WHERE f.accordion_id = (
         SELECT a.id
           FROM master_page_accordion_t a
           JOIN master_page_t p ON p.id = a.page_id
          WHERE p.slug = 'import' AND a.slug = 'documentation'
       )
   AND f.props ? 'currencyField'
   AND f.props->>'colSpan' = '2-of-5';
