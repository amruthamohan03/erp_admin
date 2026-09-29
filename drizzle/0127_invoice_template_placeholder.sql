-- Say what a blank Invoice Template means.
--
-- 0126 removed the `fromRelated` derive that used to prefill this field, because
-- its source (`client_master_t.invoice_template`, a varchar(1) holding 'I'/'E')
-- names no design. The field is optional and an empty one is CORRECT — the
-- renderer falls back to the master's default row — but an empty dropdown with
-- no placeholder reads as something the operator forgot to fill in.
--
-- Deliberately a placeholder and NOT a `defaultValue`: a default would have to
-- name a template code in config, and would then go on naming it after somebody
-- made a different template the default, so two places would disagree about
-- which design a new invoice gets.
UPDATE "master_page_accordion_field_t" AS f
   SET "props" = COALESCE(f."props", '{}'::jsonb)
                 || '{"placeholder": "Default template"}'::jsonb
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE a."id" = f."accordion_id"
   AND p."slug" = 'import-invoices'
   AND f."name" = 'invoice_template';
