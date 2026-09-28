-- Requestee is locked back to the signed-in user.
--
-- 0119 made it editable so a request could be raised on somebody else's behalf.
-- That is being reversed: the Requestee IS whoever is signed in, and letting it
-- be typed over means a request can carry a name that never touched it.
--
-- A NEW migration rather than an edit to 0119 (§7.2) — 0119 has been applied, so
-- the way to change what it did is another step, not a rewrite of history.
--
-- `editable: false` on an async derive means three things in the runtime, and
-- all three are wanted here: the field renders read-only, the @init prefill
-- still fills it from the session, and the page backfills it on load so an older
-- record that was typed over shows the stored value rather than silently
-- adopting the reader's name.
UPDATE "master_page_accordion_field_t" f
   SET "derive" = jsonb_set(f."derive", '{editable}', 'false'::jsonb),
       "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id"
   AND p."slug" = 'payment'
   AND f."name" = 'requestee'
   AND f."derive" IS NOT NULL;
--> statement-breakpoint

-- The second half, and the reason this field was never actually locked.
--
-- Its props carried `"readonly": "readonly"` — lower-case key, string value.
-- The renderer tests `props.readOnly === true` (camelCase, strict boolean), so
-- that key matched nothing and the field stayed editable while its config said
-- otherwise. Every other read-only field in the app spells it `readOnly: true`;
-- this one row is the only place in the database with the typo, so it is
-- normalised rather than the renderer being taught a second spelling.
--
-- Belt and braces with the derive above: the derive decides it today, and this
-- keeps it read-only even if the derive is later changed or removed.
UPDATE "master_page_accordion_field_t" f
   SET "props" = (f."props" - 'readonly') || '{"readOnly": true}'::jsonb,
       "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id"
   AND p."slug" = 'payment'
   AND f."name" = 'requestee'
   AND f."props" ? 'readonly';
