-- §4.5/§4.12 — config-driven conditional logic for transactional-page fields.
-- A field can be shown/hidden, made required/optional, set read-only, or have a
-- date/number min/max bound — all keyed off OTHER field values on the same form.
-- The rules live in this JSONB column (config), never in component code, so the
-- kind/goods IDs that drive the license form stay as data in seed rows.
--
-- Shape (all keys optional; absence ⇒ static behavior, fully backward-compatible):
--   {
--     "visibleWhen":  <Pred>,   -- field rendered only when true (default: always)
--     "requiredWhen": <Pred>,   -- overrides the static `required` flag when present
--     "readonlyWhen": <Pred>,   -- forces read-only when true
--     "min": { "field": "<other_field>" } | { "value": "today" | <literal> },
--     "max": { "field": "<other_field>" } | { "value": "today" | <literal> }
--   }
-- where <Pred> is a leaf { "field", "eq"|"neq"|"in"|"nin"|"gt"|"lt"|"truthy"|"falsy" }
-- or a combinator { "all": [...] } | { "any": [...] } | { "not": <Pred> }.

ALTER TABLE "master_page_accordion_field_t"
  ADD COLUMN IF NOT EXISTS "conditions" jsonb;
