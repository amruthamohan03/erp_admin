-- 0079 — Payment Request's Requestee prefills with whoever is signed in (§4.1).
--
-- Config, not code: `@init` is the reserved trigger for a derive that fires once
-- when a NEW record's form opens rather than in response to another field
-- changing, and the `session` source already backs the Clients page's
-- Verified By / Approved By prefills. This reuses both — no new derive kind, no
-- special case in the renderer.
--
-- `full_name`, not `username`: requestee is a varchar holding a person's name,
-- not a user FK, so it wants the name. The session source falls back to the
-- login handle when a user has no full name recorded.
--
-- `editable: true` is the point. The person filling the form in is USUALLY the
-- requestee, not always — a convenience, not an attribution lock. Who actually
-- saved the record is the audit log's job (§4.28) and cannot be typed over.
UPDATE master_page_accordion_field_t f
   SET derive = '{"kind":"fromRelated","source":"session","column":"full_name","trigger":"@init","editable":true}'::jsonb,
       updated_at = now()
  FROM master_page_accordion_t a, master_page_t p
 WHERE f.accordion_id = a.id
   AND a.page_id = p.id
   AND p.slug = 'payment'
   AND f.name = 'requestee'
   AND f.derive IS NULL;
