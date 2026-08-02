import { insertSeedRows, type SeedTable } from './insertSeedRows';
import roleCatalogueJson from './data/role-catalogue.json';
import type { Database, Transaction } from '@/lib/db';

// §4.7 — production's role catalogue (Super Admin, Manager, Accounts Officer,
// the location/desk roles, Developer, …).
//
// seedBootstrapRole only creates role 1, but plenty of config keys off the
// other ids: seedPaymentStageRoles maps the approval chain onto roles 3/5/10/11
// and the transaction-page grants in seedMasterPages reference role 52. Without
// this catalogue those seeds fail their FK to role_master_t, so it runs right
// after the bootstrap role and before anything that grants permissions.
//
// Provenance: captured from the production erp_admin database with
// created_by/updated_by blanked, ordered by id so parent_role_id resolves.
// Ids are preserved — see insertSeedRows.

// JSON import boundary — narrowed once (§6: casts allowed at parse boundaries).
const ROLE_CATALOGUE = roleCatalogueJson as unknown as Record<string, SeedTable>;

export async function seedRoleCatalogue(db: Database | Transaction): Promise<void> {
  await insertSeedRows(db, 'role_master_t', ROLE_CATALOGUE.role_master_t);
}
