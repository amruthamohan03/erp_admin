-- §4.40 — warn when another client already uses the same email, phone, NIF or
-- RCCM number.
--
-- A WARNING, not a rule: two clients can legitimately share an accountant's
-- address or a group switchboard, so the form says so in amber and still saves.
-- It is configuration on the field row (`props.duplicateCheck`), read by the
-- shared FieldHints component, so any other page's field can opt in with a row
-- edit rather than a code change (§4.1). Phones are compared by digits
-- (`client-contacts` declares them in the uniqueness route), so "+243 812 345
-- 678" and "+243812345678" are recognised as the same number.
--
-- Merged into existing props, scoped by page slug + field name, and skipped
-- where already set — safe to re-run.
UPDATE "master_page_accordion_field_t" f
   SET "props" = COALESCE(f."props", '{}'::jsonb)
                 || jsonb_build_object('duplicateCheck',
                      jsonb_build_object('resource', 'client-contacts', 'field', f."name", 'noun', 'client'))
  FROM "master_page_accordion_t" a, "master_page_t" p
 WHERE f."accordion_id" = a."id" AND a."page_id" = p."id"
   AND p."slug" = 'clients'
   AND f."name" IN ('email', 'email_secondary', 'payment_contact_email',
                    'phone', 'phone_secondary', 'payment_contact_phone',
                    'nif_number', 'rccm_number')
   AND (f."props" -> 'duplicateCheck') IS NULL;
