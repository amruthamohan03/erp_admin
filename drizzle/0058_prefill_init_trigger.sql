-- 0058 — point the Verified By / Approved By prefills at the INIT trigger.
--
-- 0057 wrote `"trigger": []`, which no derive can ever match: the runtime fires an
-- async derive when the field named in `trigger` changes, and an empty list names
-- nothing. `@init` is the reserved name for "resolve once when a NEW record's form
-- opens" (see INIT_TRIGGER in src/lib/pages/derive.ts) — it is not a legal column
-- name, so it cannot collide with a real field.
UPDATE master_page_accordion_field_t
   SET derive = jsonb_set(derive, '{trigger}', '"@init"'::jsonb)
 WHERE derive IS NOT NULL
   AND derive->>'source' = 'session'
   AND derive->'trigger' = '[]'::jsonb;
