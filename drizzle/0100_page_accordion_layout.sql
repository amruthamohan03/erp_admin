-- §4.12 / §4.1 — where a section sits on a transaction page becomes CONFIG.
--
-- main's importinvoice.php puts the form in two columns: a narrow left rail
-- (INVOICE DETAILS — financials, transport, documents, comments) beside a wide
-- right panel (QUOTATION SELECTION — the quotation and its lines). Every other
-- transaction page stacks its sections full width, and exportinvoice.php does
-- too, so the arrangement belongs to the page rather than to the runtime.
--
-- `master_page_accordion_t.props` carries it:
--
--   {"panel":"side"}            -- narrow left rail
--   {"panel":"main"}            -- wide right panel, beside the rail
--   {"panel":"side","dense":1}  -- rail + label-beside-control rows, main's
--                                  compact .financial-table
--   NULL / {}                   -- full width, stacked (every existing page)
--
-- Consecutive sections that declare a panel form one two-column band; a section
-- with no panel ends the band and spans the page. Nothing is hardcoded per slug.

ALTER TABLE "master_page_accordion_t"
  ADD COLUMN IF NOT EXISTS "props" jsonb;
--> statement-breakpoint

-- IMPORT — left rail carries the detail sections, right panel the lines grid.
-- Financial Info is the compact table main draws; the rest are ordinary rows.
UPDATE "master_page_accordion_t" a
SET "props" = v.props::jsonb
FROM "master_page_t" p,
     (VALUES
       ('import-invoices', 'financial', '{"panel":"side","dense":1}'),
       ('import-invoices', 'transport', '{"panel":"side"}'),
       ('import-invoices', 'documents', '{"panel":"side"}'),
       ('import-invoices', 'comments',  '{"panel":"side"}'),
       ('import-invoices', 'items',     '{"panel":"main"}')
     ) AS v(page, slug, props)
WHERE a."page_id" = p."id" AND p."slug" = v.page AND a."slug" = v.slug;
--> statement-breakpoint

-- EXPORT stacks full width, exactly as main's exportinvoice.php does — the
-- comments grid and the MCA table each span the form. Stated explicitly so a
-- later edit to the import page cannot drift it into a rail.
UPDATE "master_page_accordion_t" a
SET "props" = NULL
FROM "master_page_t" p
WHERE a."page_id" = p."id" AND p."slug" = 'export-invoices';
--> statement-breakpoint

-- main's section titles, so the rail reads as its panel does.
UPDATE "master_page_accordion_t" a
SET "title" = v.title
FROM "master_page_t" p,
     (VALUES
       ('import-invoices', 'financial', 'Financial Info'),
       ('import-invoices', 'items',     'Quotation Selection')
     ) AS v(page, slug, title)
WHERE a."page_id" = p."id" AND p."slug" = v.page AND a."slug" = v.slug;
