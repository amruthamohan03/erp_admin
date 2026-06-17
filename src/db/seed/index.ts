import type { Database } from '@/lib/db';
import { seedLicenseTypes } from './licenseTypes';
import { seedLicenseStatuses } from './licenseStatuses';
import { seedLicenseRules } from './licenseRules';
import { seedLicenseForm } from './licenseForm';
import { seedLicenseWorkflow } from './licenseWorkflow';
import { seedLicenseCaseTemplate } from './licenseCaseTemplate';

// Master seed orchestrator per CLAUDE.md §9.
//
// Every new master table that holds slow-changing reference data adds:
//   1. its own ./<table>.ts file that exports a seedXxx(db) function and
//      uses .onConflictDoUpdate() on the table's natural key, and
//   2. a call from seedMasters() below in the right order.
//
// Ordering rules:
//   * Pure masters (no FK to other seeds) can run in any order — they're
//     listed alphabetically.
//   * Seeds that depend on other seeds' rows (looked up by natural key)
//     must come after their dependency. Today: license_workflow depends on
//     license_rules; license_case_template depends on license_form +
//     license_workflow.
//
// Seeds are idempotent (onConflictDoUpdate on the natural key) so
// re-running against a populated DB just refreshes the rows.
//
// The full runner lives in scripts/seed-admin.js (legacy admin-user seed) —
// the migration to scripts/seed.ts that calls seedMasters() is a follow-up.

export async function seedMasters(db: Database): Promise<void> {
  // Independent foundational masters.
  await seedLicenseTypes(db);
  await seedLicenseStatuses(db);
  await seedLicenseRules(db);

  // Form definition + fields for license creation.
  await seedLicenseForm(db);

  // Workflow + transitions; the approve transition references
  // license.no_self_approve, so rules must be seeded first.
  await seedLicenseWorkflow(db);

  // Glue: ties license_create form + license_default workflow + license_t
  // target. Must come last.
  await seedLicenseCaseTemplate(db);
}

export {
  seedLicenseTypes,
  seedLicenseStatuses,
  seedLicenseRules,
  seedLicenseForm,
  seedLicenseWorkflow,
  seedLicenseCaseTemplate,
};
