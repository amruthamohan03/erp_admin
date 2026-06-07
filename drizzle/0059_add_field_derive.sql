-- §4.5/§4.12 — config-driven DERIVED field values for transactional pages.
-- Where `conditions` (0056) GATES a field (show/hide/require/bound), `derive`
-- COMPUTES or FETCHES a field's value. Four kinds, all expressed as data here so
-- the business rules stay out of component code:
--
--   { "kind": "statusMap", "rules": [ { "when": <Pred>, "value": <v> }, ... ],
--     "default": <v> }                       -- pure: first matching rule wins
--   { "kind": "formula", "op": "subtract"|"add"|"sum", "fields": ["a","b"] }
--                                             -- pure: arithmetic over field values
--   { "kind": "fromRelated", "trigger": "<field>", "source": "<src>",
--     "column": "<col>", "valueMap": { "1": "X" } }
--                                             -- async: copy a column off a related row
--   { "kind": "template", "trigger": "<field>", "source": "<src>",
--     "template": "{token}-{seq}" }           -- async: build a string from source tokens
--
-- Pure kinds run reactively on the client and are re-enforced on save (server).
-- Async kinds resolve through POST /api/pages/:slug/derive against a vetted
-- source registry (src/lib/pages/deriveSources.ts). NULL ⇒ the field is plain.

ALTER TABLE "master_page_accordion_field_t"
  ADD COLUMN IF NOT EXISTS "derive" jsonb;
