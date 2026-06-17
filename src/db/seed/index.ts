import type { Database } from '@/lib/db';
import { seedFieldValidations } from './fieldValidations';
import { seedLicenseTypes } from './licenseTypes';
import { seedLicenseStatuses } from './licenseStatuses';
import { seedLicenseRules } from './licenseRules';
import { seedLicenseForm } from './licenseForm';
import { seedLicenseWorkflow } from './licenseWorkflow';
import { seedLicenseCaseTemplate } from './licenseCaseTemplate';
import { seedLicensesMenu } from './licensesMenu';
import { seedInvoiceStatuses } from './invoiceStatuses';
import { seedInvoiceForm } from './invoiceForm';
import { seedInvoiceWorkflow } from './invoiceWorkflow';
import { seedInvoiceCaseTemplate } from './invoiceCaseTemplate';
import { seedInvoicesMenu } from './invoicesMenu';
import { seedTrackingTemplates } from './trackingTemplates';
import { seedPaymentRequestApprovals } from './paymentRequestApprovals';
import { seedPaymentRequestStatuses } from './paymentRequestStatuses';
import { seedPaymentRequestForm } from './paymentRequestForm';
import { seedPaymentRequestWorkflow } from './paymentRequestWorkflow';
import { seedPaymentRequestCaseTemplate } from './paymentRequestCaseTemplate';
import { seedPaymentRequestsMenu } from './paymentRequestsMenu';

// Master seed orchestrator per CLAUDE.md §9.
//
// Every new master table that holds slow-changing reference data adds:
//   1. its own ./<table>.ts file that exports a seedXxx(db) function and
//      uses .onConflictDoUpdate() on the table's natural key, and
//   2. a call from seedMasters() below in the right order.
//
// Ordering rules:
//   * Pure masters (no FK to other seeds) can run in any order.
//   * Seeds that depend on other seeds' rows (looked up by natural key)
//     must come after their dependency. Each domain module follows the
//     same shape: statuses + rules + hierarchy → form → workflow →
//     case_template → menu.
//
// Seeds are idempotent (onConflictDoUpdate on the natural key) so
// re-running against a populated DB just refreshes the rows.

export async function seedMasters(db: Database): Promise<void> {
  // Independent foundational masters.
  await seedFieldValidations(db);
  await seedLicenseTypes(db);

  // --- License module (§2 step 2) -------------------------------------
  await seedLicenseStatuses(db);
  await seedLicenseRules(db);
  await seedLicenseForm(db);
  await seedLicenseWorkflow(db); // depends on licenseRules
  await seedLicenseCaseTemplate(db); // depends on licenseForm + licenseWorkflow
  await seedTrackingTemplates(db); // depends on licenseTypes

  // --- Invoice module (§2 step 4) -------------------------------------
  await seedInvoiceStatuses(db);
  await seedInvoiceForm(db); // depends on fieldValidations (iso.currency_code)
  await seedInvoiceWorkflow(db);
  await seedInvoiceCaseTemplate(db);

  // --- Payment Request module (§2 step 6) -----------------------------
  // Approvals must seed before the workflow (transitions reference the
  // hierarchy by key from action_json).
  await seedPaymentRequestApprovals(db);
  await seedPaymentRequestStatuses(db);
  await seedPaymentRequestForm(db); // depends on fieldValidations
  await seedPaymentRequestWorkflow(db); // depends on approvals
  await seedPaymentRequestCaseTemplate(db);

  // Sidebar entries + permission grants. Last so the navigation lights up
  // only after every route it points at is real.
  await seedLicensesMenu(db);
  await seedInvoicesMenu(db);
  await seedPaymentRequestsMenu(db);
}

export {
  seedFieldValidations,
  seedLicenseTypes,
  seedLicenseStatuses,
  seedLicenseRules,
  seedLicenseForm,
  seedLicenseWorkflow,
  seedLicenseCaseTemplate,
  seedLicensesMenu,
  seedInvoiceStatuses,
  seedInvoiceForm,
  seedInvoiceWorkflow,
  seedInvoiceCaseTemplate,
  seedInvoicesMenu,
  seedTrackingTemplates,
  seedPaymentRequestApprovals,
  seedPaymentRequestStatuses,
  seedPaymentRequestForm,
  seedPaymentRequestWorkflow,
  seedPaymentRequestCaseTemplate,
  seedPaymentRequestsMenu,
};
