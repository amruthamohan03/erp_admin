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
}
