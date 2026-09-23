-- An amount and its currency need a wider cell than a lone field.
--
-- Fields like FOB, Fret, Other Charges and Insurance Amount weld a number input
-- to a currency picker (`props.currencyField`), but still sat in a `5-per-row`
-- cell — a fifth of a row for two controls. The currency was squeezed to about
-- fifty pixels of readable text, so a selected code was ellipsised and an unset
-- one showed a truncated "— Select —": the box said nothing about what it held.
--
-- §4.36 is explicit that the fix for a field carrying a companion control is to
-- give it more room rather than to shrink the companion, and `2-of-5` is the
-- span that exists for exactly this (it steps with the same breakpoints as
-- `5-per-row`, so a row still lines up). The companion box itself widens from
-- w-24 to w-28 in the shared Accordion; doing that alone would have taken the
-- width out of the amount instead of solving anything.
--
-- Driven off `currencyField` rather than a list of column names, so a pair
-- added later through the page-builder gets the right width without another
-- migration (§4.1).
UPDATE "master_page_accordion_field_t"
   SET "props" = "props" || '{"colSpan": "2-of-5"}'::jsonb,
       "updated_at" = now()
 WHERE "props" ? 'currencyField'
   AND COALESCE("props" ->> 'colSpan', '5-per-row') = '5-per-row';
