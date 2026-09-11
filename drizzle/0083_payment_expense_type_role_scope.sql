-- §4.1 — scope the Payment Request's Expense Type picker to the caller's role.
--
-- Config, not code: `props.optionsFilters` is the existing hook for a fixed
-- query param that is a property of the FIELD rather than of what the operator
-- has typed (the same mechanism Import Tracking's licence picker uses for
-- `use_for=import`). So the renderer learns nothing about roles — it appends
-- `for_role=me` and /api/v1/expense-types narrows the list against
-- role_expense_type_mapping_t.
--
-- `optionsParams` is left as it was: pay_for still comes from the form. The two
-- maps are siblings — one reads a value from the form, the other states one that
-- is always so — and both are merged into the same request.
--
-- A role with no mapping rows is unrestricted, so this changes nothing for
-- anyone until an administrator ticks something under Mapping → Role Expense
-- Type Mapping.
UPDATE "master_page_accordion_field_t"
SET "props" = COALESCE("props", '{}'::jsonb)
              || jsonb_build_object('optionsFilters', jsonb_build_object('for_role', 'me')),
    "updated_at" = now()
WHERE "id" = 250
  AND "name" = 'expense_type'
  -- jsonb_exists(), not the `?` operator: when the key is absent `->` yields
  -- SQL NULL, `NULL ? 'x'` is NULL, and NOT NULL is NULL — so the guard
  -- excluded exactly the rows it was meant to include and the UPDATE hit
  -- nothing. COALESCE to an empty object first and the predicate is a real
  -- boolean.
  AND NOT jsonb_exists(COALESCE("props" -> 'optionsFilters', '{}'::jsonb), 'for_role');
