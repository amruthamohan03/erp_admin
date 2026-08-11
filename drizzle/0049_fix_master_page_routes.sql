-- 0049 — point four master_page_t routes at the pages that actually exist.
--
-- `route` is the page's list view: §4.13 Back falls back to it, and a create now
-- returns to it. Four of the eight rows named a path with no page behind it, so
-- both landed on a 404:
--
--   clients  /clients  -> /masters/clients   (only /clients/dashboard exists)
--   import   /import   -> /imports
--   export   /export   -> /exports
--   license  /license  -> /licenses
--
-- payment, local, export-invoices and import-invoices were already correct and
-- are left alone. Each statement is matched on the old value, so a database
-- already corrected by hand is untouched.
UPDATE "master_page_t" SET "route" = '/masters/clients'
 WHERE "slug" = 'clients' AND "route" = '/clients';

UPDATE "master_page_t" SET "route" = '/imports'
 WHERE "slug" = 'import' AND "route" = '/import';

UPDATE "master_page_t" SET "route" = '/exports'
 WHERE "slug" = 'export' AND "route" = '/export';

UPDATE "master_page_t" SET "route" = '/licenses'
 WHERE "slug" = 'license' AND "route" = '/license';
