import { sql } from 'drizzle-orm';
import { insertSeedRows, type SeedTable } from './insertSeedRows';
import masterPagesJson from './data/master-pages.json';
import type { Database, Transaction } from '@/lib/db';

// §4.5 / §4.12 — the transaction-page configuration: which pages exist
// (clients, license, import, export, local, payment, import/export invoice),
// the accordions each one renders, every field on those accordions with its
// type, options source, validation, visibility conditions and derive rule, the
// per-role view/edit grants, and the bulk-edit filters each list page offers.
//
// Without these rows a migrated database has the tables but every transaction
// page renders an empty form — this is the module's real content, so it seeds
// like any other master rather than being hand-coded (§4.5).
//
// Provenance: captured from the production erp_admin database with
// created_by/updated_by blanked. The role grants reference production's role
// ids, so this must run after seedRoleCatalogue.

// JSON import boundary — narrowed once (§6: casts allowed at parse boundaries).
const MASTER_PAGES = masterPagesJson as unknown as Record<string, SeedTable>;

// Page → accordion → field, then the grants that hang off them.
const ORDER: readonly string[] = [
  'master_page_t',
  'master_page_accordion_t',
  'master_page_accordion_field_t',
  'master_page_accordion_role_t',
  'master_page_accordion_field_role_t',
  'master_bulk_filter_t',
];

export async function seedMasterPages(db: Database | Transaction): Promise<void> {
  for (const table of ORDER) {
    await insertSeedRows(db, table, MASTER_PAGES[table]);
  }
  await deriveExportLicensePage(db);
}

/**
 * The Export Licence page, derived from the Licence page (§4.10).
 *
 * The twin of migration 0115, which does the same for an already-seeded
 * database. It is DERIVED rather than captured into master-pages.json on
 * purpose: the two forms differ only in the Kind picker's scope, and writing
 * twenty-eight field rows out a second time would guarantee they drift.
 *
 * Export licences are not a different record — `license_t` is direction-
 * agnostic and `kind_id` is the only discriminator. The second page exists so
 * the export form can offer export kinds only, and so saving returns to
 * /export-licenses rather than the import list (§4.13).
 */
async function deriveExportLicensePage(db: Database | Transaction): Promise<void> {
  await db.execute(sql`
    INSERT INTO master_page_t (slug, title, route, target_table, display_order, display)
    SELECT 'export-license', 'Export License', '/export-licenses', 'license_t', 11, 'Y'
    WHERE NOT EXISTS (SELECT 1 FROM master_page_t WHERE slug = 'export-license')`);

  await db.execute(sql`
    INSERT INTO master_page_accordion_t (page_id, slug, title, icon, props, display_order)
    SELECT ep.id, a.slug, a.title, a.icon, a.props, a.display_order
      FROM master_page_accordion_t a
      JOIN master_page_t lp ON lp.id = a.page_id AND lp.slug = 'license'
      CROSS JOIN master_page_t ep
     WHERE ep.slug = 'export-license'
       AND NOT EXISTS (
         SELECT 1 FROM master_page_accordion_t x
          WHERE x.page_id = ep.id AND x.slug = a.slug)`);

  await db.execute(sql`
    INSERT INTO master_page_accordion_field_t
      (accordion_id, name, label, field_type, required, options_source,
       options_label_field, options_static, props, conditions, derive, display_order)
    SELECT ea.id, f.name, f.label, f.field_type, f.required, f.options_source,
           f.options_label_field, f.options_static, f.props, f.conditions, f.derive,
           f.display_order
      FROM master_page_accordion_field_t f
      JOIN master_page_accordion_t la ON la.id = f.accordion_id
      JOIN master_page_t lp ON lp.id = la.page_id AND lp.slug = 'license'
      JOIN master_page_t ep ON ep.slug = 'export-license'
      JOIN master_page_accordion_t ea ON ea.page_id = ep.id AND ea.slug = la.slug
     WHERE NOT EXISTS (
       SELECT 1 FROM master_page_accordion_field_t x
        WHERE x.accordion_id = ea.id AND x.name = f.name)`);

  // §4.7 — an accordion with no grant row is invisible to every role, so without
  // this the derived page renders as an empty form.
  await db.execute(sql`
    INSERT INTO master_page_accordion_role_t (accordion_id, role_id, permission)
    SELECT ea.id, r.role_id, r.permission
      FROM master_page_accordion_role_t r
      JOIN master_page_accordion_t la ON la.id = r.accordion_id
      JOIN master_page_t lp ON lp.id = la.page_id AND lp.slug = 'license'
      JOIN master_page_t ep ON ep.slug = 'export-license'
      JOIN master_page_accordion_t ea ON ea.page_id = ep.id AND ea.slug = la.slug
     WHERE NOT EXISTS (
       SELECT 1 FROM master_page_accordion_role_t x
        WHERE x.accordion_id = ea.id AND x.role_id = r.role_id
          AND x.permission = r.permission)`);

  // The one deliberate difference between the two pages.
  await db.execute(sql`
    UPDATE master_page_accordion_field_t f
       SET options_source = 'kinds?group=export', updated_at = now()
      FROM master_page_accordion_t a
      JOIN master_page_t p ON p.id = a.page_id
     WHERE f.accordion_id = a.id AND p.slug = 'export-license' AND f.name = 'kind_id'`);

  await db.execute(sql`
    UPDATE master_page_accordion_field_t f
       SET options_source = 'kinds?group=import', updated_at = now()
      FROM master_page_accordion_t a
      JOIN master_page_t p ON p.id = a.page_id
     WHERE f.accordion_id = a.id AND p.slug = 'license' AND f.name = 'kind_id'`);
}
