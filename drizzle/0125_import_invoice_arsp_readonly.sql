-- ARSP on the Import Invoice comes from the quotation, and is not typed.
--
-- ARSP is a term of the QUOTATION — the optional 1.2 % fee the client agreed
-- to — so the invoice must state what was quoted. The field was free text with
-- a 'Disabled' default, auto-filled only when picking MCA files matched a
-- quotation exactly, and typeable at every other moment. An invoice could
-- therefore charge ARSP the quotation did not, and nothing on the record said
-- which of the two was right.
--
-- `props.readOnly` is the page runtime's "the SYSTEM fills this" flag, the same
-- one Kind / Type of Goods / Transport Mode already carry on this page. It
-- locks the control but still SUBMITS AND SAVES the value, which is what a
-- derived field needs (see Accordion.tsx).
--
-- The placeholder changes with it: "Disabled" described the default, and on a
-- locked control that reads as a value nobody can change. "From quotation" says
-- where it comes from, so an empty one sends the operator to the right screen.
--
-- Scoped to the import-invoices page by slug. Export invoices are untouched.
UPDATE "master_page_accordion_field_t" AS f
   SET "props" = COALESCE(f."props", '{}'::jsonb)
                 || '{"readOnly": true, "placeholder": "From quotation"}'::jsonb
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE a."id" = f."accordion_id"
   AND p."slug" = 'import-invoices'
   AND f."name" = 'arsp'
   AND COALESCE(f."props" -> 'readOnly', 'false'::jsonb) <> 'true'::jsonb;
