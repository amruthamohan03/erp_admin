-- 0080 — Requestee is read-only, matching the app this page is modelled on.
--
-- 0079 prefilled it and left it editable, reasoning that the person filling the
-- form in is usually but not always the requestee. The reference implementation
-- renders the field `readonly` with the session's full name, so the requestee IS
-- the signed-in user by definition there, and an editable box invites a value
-- the approval chain cannot rely on.
--
-- `editable: false` on an async derive is what the page runtime already reads to
-- mark a field authoritative (Accordion + TransactionalPage both gate on
-- `isEditableDerive`), so this is a config flip, not a renderer special case.
-- The field keeps its required star and is exempt from the constraint, per §4.18
-- for derived fields.
UPDATE master_page_accordion_field_t f
   SET derive = jsonb_set(f.derive, '{editable}', 'false'::jsonb),
       updated_at = now()
  FROM master_page_accordion_t a, master_page_t p
 WHERE f.accordion_id = a.id
   AND a.page_id = p.id
   AND p.slug = 'payment'
   AND f.name = 'requestee'
   AND f.derive IS NOT NULL;
