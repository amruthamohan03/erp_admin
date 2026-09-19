-- §4.12 / §4.1 — the rest of the import invoice's left rail becomes compact rows.
--
-- main's importinvoice.php draws EVERY section of its INVOICE DETAILS rail —
-- financial info, road/wagon/air transport, documents and comments — as the same
-- label-beside-control `.financial-table`. 0100 made Financial Info dense; the
-- other three were left on the five-per-row grid, which inside a 25% column
-- squeezes each field to a sliver. Same config key, same runtime — data only.

UPDATE "master_page_accordion_t" a
SET "props" = '{"panel":"side","dense":1}'::jsonb
FROM "master_page_t" p
WHERE a."page_id" = p."id"
  AND p."slug" = 'import-invoices'
  AND a."slug" IN ('transport', 'documents', 'comments');
