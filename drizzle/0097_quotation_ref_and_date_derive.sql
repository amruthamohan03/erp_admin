-- §2 step 2 / §4.12 — the Quotation's reference and date, as main's screen
-- fills them.
--
-- 0095 registered `quotation_ref` as REQUIRED and READ-ONLY but gave it no
-- derive, so nothing ever filled it and the operator could not type it: no
-- quotation could be saved from the transaction page at all. main builds it in
-- the browser from the four pickers' labels —
--
--     `${client}-${kind}-${transport}-${goods}`   e.g. NMI-IMPORT DEFINITVE-ROAD-COPPER
--
-- — and blanks it until all four are chosen. That is a `template` derive over
-- the `quotation_ref` source (deriveSources.ts), with the ARRANGEMENT here in
-- config, where it can be changed without a deploy (§4.1). The save route
-- rebuilds it from the same source and template and refuses a duplicate.
--
-- `readOnly` comes off the props: a non-editable derive already renders
-- read-only, which is how every other generated reference is configured.
UPDATE "master_page_accordion_field_t" f
SET "derive" = '{"kind":"template","source":"quotation_ref","trigger":["client_id","kind_id","transport_mode_id","goods_type_id"],"template":"{client}-{kind}-{transport}-{goods}"}'::jsonb,
    "props"  = (COALESCE(f."props", '{}'::jsonb) - 'readOnly')
               || '{"placeholder":"Auto-generated"}'::jsonb
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
WHERE f."accordion_id" = a."id"
  AND p."slug" = 'quotation'
  AND f."name" = 'quotation_ref'
  -- Leave a derive someone has already configured through the page builder.
  AND f."derive" IS NULL;
--> statement-breakpoint

-- The date opens on today — main's setTodayDate() — and stays editable. The
-- same `@init` prefill the Clients page uses for its verified/approved dates,
-- so a copied quotation is re-dated too (the copy drops async-derived values).
UPDATE "master_page_accordion_field_t" f
SET "derive" = '{"kind":"fromRelated","source":"session","column":"today","trigger":"@init","editable":true}'::jsonb
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
WHERE f."accordion_id" = a."id"
  AND p."slug" = 'quotation'
  AND f."name" = 'quotation_date'
  AND f."derive" IS NULL;
