-- The Requestee on a payment request becomes editable.
--
-- It was filled from the session's own full name at @init and locked
-- (`"editable": false`), so a request could only ever be recorded in the name of
-- whoever typed it. In practice somebody raises a request on behalf of a
-- colleague — the person the payment is actually for — and the field existed to
-- say so.
--
-- Config, not code (§4.1). `editable: true` on an async derive means three
-- things in the runtime, and all three are what is wanted here:
--   * the field renders as an input rather than read-only;
--   * the @init prefill still fires, so the common case is one less thing to
--     type and the name is right by default;
--   * the page stops backfilling it on load, so a value the operator changed is
--     not quietly reverted to theirs the next time the record is opened.
--
-- Nothing about ownership changes. Who may edit a request is decided by
-- `created_by` (canEditRequest in src/lib/payments/stages.ts), not by this
-- field, so making it typeable does not let anyone edit a request they could
-- not already edit.
UPDATE "master_page_accordion_field_t" f
   SET "derive" = jsonb_set(f."derive", '{editable}', 'true'::jsonb),
       "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id"
   AND p."slug" = 'payment'
   AND f."name" = 'requestee'
   AND f."derive" IS NOT NULL;
