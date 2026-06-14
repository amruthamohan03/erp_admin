-- §4.5 — make the Regime dropdown depend on the selected client's trade direction
-- (client_type I/E/L) on the Import & Export transactional pages. Config-only: add
-- `optionsParams` to the regime field's props so the runtime requests
-- /api/regimes?client_id=<selected client>, which filters regimes whose type letters
-- intersect the client's client_type. (The License page has no regime field; if one
-- is added, apply the same props.) Idempotent — jsonb merge re-sets the same value.

UPDATE "master_page_accordion_field_t" f
   SET "props" = COALESCE(f."props", '{}'::jsonb) || '{"optionsParams":{"client_id":"client_id"}}'::jsonb
 WHERE f."name" = 'regime'
   AND f."accordion_id" IN (
     SELECT a.id
     FROM "master_page_accordion_t" a
     JOIN "master_page_t" p ON p.id = a."page_id"
     WHERE p."slug" IN ('import', 'export')
   );
