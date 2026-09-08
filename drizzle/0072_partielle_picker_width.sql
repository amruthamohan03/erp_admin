-- 0072 — the PARTIELLE picker gets two columns instead of one.
--
-- It is the only field that is a control PLUS a button: the dropdown and the
-- gear that opens PARTIELLE Management share one cell. In a five-per-row grid
-- that left the dropdown's trigger NARROWER than the option list's own minimum
-- width, so opening it painted the list across the next input — and the option
-- labels it has to show ("TCL-002 — rem 73 KG / 8 FOB") had no room either.
--
-- `2-of-5` is a new colSpan in Accordion.tsx, stepping through the same
-- breakpoints as `5-per-row` so a row still lines up.
UPDATE master_page_accordion_field_t f
   SET props = COALESCE(f.props, '{}'::jsonb) || '{"colSpan":"2-of-5"}'::jsonb,
       updated_at = now()
  FROM master_page_accordion_t a
  JOIN master_page_t p ON p.id = a.page_id
 WHERE f.accordion_id = a.id
   AND p.slug IN ('import', 'export')
   AND f.field_type = 'partielle-picker';
