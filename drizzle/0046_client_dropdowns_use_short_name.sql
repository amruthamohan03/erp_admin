-- 0046 — every client dropdown labels its options by the client's short code.
--
-- Clients carry two names: `company_name` (full legal name, up to 200 chars) and
-- `short_name` (the 3-character client code). Pickers show the short code — it is
-- what operators say out loud and what the reference formats embed, and a column of
-- 200-character legal names makes a select unreadable. See CLAUDE.md §4.15.
--
-- The metadata page runtime resolves a select's label column from
-- `master_page_accordion_field_t.options_label_field`. The seed already ships
-- 'short_name' for all seven client selects, so on a freshly seeded database this is
-- a no-op; it exists to repair a database where the value was edited in the
-- page-builder UI, or predates the seed carrying it.
UPDATE "master_page_accordion_field_t"
   SET "options_label_field" = 'short_name'
 WHERE "options_source" = 'clients'
   AND ("options_label_field" IS DISTINCT FROM 'short_name');
