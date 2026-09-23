-- A payment request for zero is not a payment request.
--
-- `amount` was configured `{"min": 0, ...}` and marked required, and neither
-- rejected 0: the required check asks whether the field ENDS UP with a value,
-- and 0 is a value. So a request for nothing could be raised, routed through
-- the whole approval chain, and approved by people who had no reason to look
-- twice at the number.
--
-- The fix is the field's own config, not a handler (§4.1) — the runtime now
-- enforces `props.min` server-side for number fields, the same bound the
-- browser already applied to the input. 0.01 rather than "greater than zero"
-- because the column is numeric(15,2): a cent is the smallest amount that can
-- actually be stored, so it is the smallest that can be meant.
--
-- `minMessage` overrides the generated sentence, which would have read "Amount
-- must be at least 0.01." That names the field and the bound but not the fix:
-- Amount is a PURE derive summing the tracking-reference grid, so it renders
-- read-only and an operator told to raise it is looking at a box they cannot
-- type in. §4.23 asks a message to answer "what do I do", so it names the grid.
UPDATE "master_page_accordion_field_t" f
   SET "props" = COALESCE(f."props", '{}'::jsonb)
                 || jsonb_build_object(
                      'min', 0.01,
                      'minMessage',
                      'Amount must be more than zero. It is the total of the '
                      || 'Tracking References below — enter an amount on each row.'
                    ),
       "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id"
   AND p."slug" = 'payment'
   AND f."name" = 'amount';
