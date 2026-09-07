-- 0064 — an amount and the currency it is quoted in become ONE field.
--
-- Import Tracking's Documentation accordion carried five amount/currency pairs
-- as ten independent cells. At five columns per row a pair ate two of them and
-- could end up on different rows, so an operator could read "Fret 12 400" with
-- no currency anywhere in sight — and on a 50-field form that is a figure whose
-- meaning depends on something off screen.
--
-- Which fields pair is CONFIG, not a list in code (§4.1): the amount names its
-- companion in `props.currencyField`, and the renderer welds the two into one
-- control (.input-group). Both columns are still written exactly as before, so
-- there is no data migration and no change to any report that reads them.
--
-- The currency rows keep display = 'Y' deliberately. They are not hidden — they
-- are rendered INSIDE their amount, and the layout skips whatever an amount has
-- claimed. Hiding them would drop the currency from the form entirely.

UPDATE master_page_accordion_field_t f
   SET props = COALESCE(f.props, '{}'::jsonb)
               || jsonb_build_object('currencyField', pair.currency_field),
       updated_at = now()
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id,
       (VALUES
          ('fret',             'fret_currency'),
          ('other_charges',    'other_charges_currency'),
          ('insurance_amount', 'insurance_amount_currency'),
          ('r_fob',            'r_fob_currency'),
          ('fob',              'fob_currency')
       ) AS pair(amount_field, currency_field)
 WHERE f.accordion_id = a.id
   AND p.slug = 'import'
   AND f.name = pair.amount_field
   -- Only pair when the companion actually exists on the same accordion; a
   -- dangling name would render the amount alone and silently drop nothing,
   -- but the config would still be lying about what is there.
   AND EXISTS (
         SELECT 1 FROM master_page_accordion_field_t c
          WHERE c.accordion_id = f.accordion_id
            AND c.name = pair.currency_field);
