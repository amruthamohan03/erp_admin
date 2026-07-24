import type { Database } from '@/lib/db';
import { seedBootstrapRole } from './bootstrapRole';
import { seedFieldValidations } from './fieldValidations';
import { seedLicenseTypes } from './licenseTypes';
import { seedLicenseStatuses } from './licenseStatuses';
import { seedLicenseRules } from './licenseRules';
import { seedLicenseForm } from './licenseForm';
import { seedLicenseWorkflow } from './licenseWorkflow';
import { seedLicenseCaseTemplate } from './licenseCaseTemplate';
import { seedInvoiceStatuses } from './invoiceStatuses';
import { seedInvoiceForm } from './invoiceForm';
import { seedInvoiceWorkflow } from './invoiceWorkflow';
import { seedInvoiceCaseTemplate } from './invoiceCaseTemplate';
import { seedTrackingTemplates } from './trackingTemplates';
// NOTE: the workflow-engine payment-request scaffold (approvals/statuses/form/
// workflow/case-template seeds) was superseded by the transaction-pages payment
// module — payment_request_t now carries main's stage columns and the stage→role
// map lives in payment_stage_role_master_t (seeded by seedPaymentStageRoles).
import { seedPaymentStageRoles } from './paymentStageRoles';
import { seedCreditNoteStatuses } from './creditNoteStatuses';
import { seedCreditNoteForm } from './creditNoteForm';
import { seedCreditNoteWorkflow } from './creditNoteWorkflow';
import { seedCreditNoteCaseTemplate } from './creditNoteCaseTemplate';
import { seedTrackingStatuses } from './trackingStatuses';
import { seedTrackingForm } from './trackingForm';
import { seedTrackingWorkflow } from './trackingWorkflow';
import { seedTrackingCaseTemplate } from './trackingCaseTemplate';
import { seedTaxRules } from './taxRules';
import { seedReportForms } from './reportForms';
import { seedReportDefinitions } from './reportDefinitions';
import { seedMenus } from './menus';
import { seedDashboardCards } from './dashboardCards';
import { seedApplicationSettings } from './applicationSettings';
import { seedSampleClients } from './sampleClients';
import { seedSampleImports } from './sampleImports';
import { seedSampleExports } from './sampleExports';
import { seedSampleLicenses } from './sampleLicenses';
import { seedSampleQuotations } from './sampleQuotations';

// Master seed orchestrator per CLAUDE.md §9.
//
// Every new master table that holds slow-changing reference data adds
// its own ./<table>.ts file that exports a seedXxx(db) function using
// .onConflictDoUpdate() on the table's natural key, and a call from
// seedMasters() below in the right order.
//
// Sidebar / permission grants live in ONE authoritative file — see
// ./menus.ts. Adding a new sidebar entry means one edit to the SPEC
// array there, choosing which parent group it belongs under.
//
// Ordering rules:
//   * Pure masters (no FK to other seeds) can run in any order.
//   * Seeds that depend on other seeds' rows (looked up by natural key)
//     must come after their dependency. Each domain module follows the
//     same shape: statuses + rules + hierarchy → form → workflow →
//     case_template.
//
// Seeds are idempotent (onConflictDoUpdate on the natural key) so
// re-running against a populated DB just refreshes the rows.

export async function seedMasters(db: Database): Promise<void> {
  // Bootstrap Super Admin role (id = 1). Must run first: the admin
  // user and every role_menu_mapping row below reference role_id = 1.
  await seedBootstrapRole(db);

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

  // --- Tracking module (§2 step 3) ------------------------------------
  // Statuses + form + workflow + case_template for tracking_t. Per-
  // milestone advancement lives on a separate endpoint (kept off the
  // case-runtime so milestones_json can change without rewriting
  // workflow transitions).
  await seedTrackingStatuses(db);
  await seedTrackingForm(db);
  await seedTrackingWorkflow(db);
  await seedTrackingCaseTemplate(db);

  // --- Fiche de Calcul (§2 step 3 / §4.1) -----------------------------
  // Sample DRC tax rules. The compute endpoint composes them via
  // loadTaxRule + applyRule — no new transactional table; rules are
  // read every call so admins can edit them without restarting.
  await seedTaxRules(db);

  // --- Invoice module (§2 step 4) -------------------------------------
  await seedInvoiceStatuses(db);
  await seedInvoiceForm(db); // depends on fieldValidations
  await seedInvoiceWorkflow(db);
  await seedInvoiceCaseTemplate(db);

  // --- Credit Note module (§2 step 5) ---------------------------------
  await seedCreditNoteStatuses(db);
  await seedCreditNoteForm(db);
  await seedCreditNoteWorkflow(db);
  await seedCreditNoteCaseTemplate(db);

  // --- Payment Request module (§2 step 6) -----------------------------
  // Transaction-pages build: the create/edit form is a master_page config
  // and the approval chain is gated by the stage→role map seeded here.
  await seedPaymentStageRoles(db);

  // --- Reports (§2 step 7) --------------------------------------------
  // Parameter forms must seed before definitions (formId FK).
  await seedReportForms(db);
  await seedReportDefinitions(db);

  // --- Application branding singleton ---------------------------------
  // One row on application_settings_master_t (id=1) that the Topbar +
  // theme provider read on mount. ON CONFLICT DO NOTHING so re-seeding
  // never clobbers operator-edited branding.
  await seedApplicationSettings(db);

  // --- Sidebar + role grants ------------------------------------------
  // Single authoritative seed that reconstructs the parent-child menu
  // hierarchy from the original DB dump (erp_admin_org.sql) with URLs
  // rewritten to this branch's routes. Run last so the navigation
  // lights up only after every dependency is in place.
  await seedMenus(db);

  // --- Dashboards: coloured stat cards + role visibility --------------
  // Cards for /dashboard, /clients/dashboard, and the module-specific
  // dashboards (import/export/license/quotation). data_source URLs
  // point at the /api/v1/*/stats endpoints; the dashboard page fetches
  // each once and resolves per-card values via the #json.path suffix.
  await seedDashboardCards(db);

  // --- Sample client data ---------------------------------------------
  // Ten realistic DRC clients so /clients/dashboard has something to
  // show out of the box. Idempotent via client_code.
  await seedSampleClients(db);

  // --- Sample consignments --------------------------------------------
  // 22 imports + 15 exports spread across the seeded clients so the
  // module dashboards + clients/dashboard top-activity table show
  // real numbers on first run. Mining clients (Glencore, Kamoa, TFM,
  // Kibali) carry most of the volume, matching DRC trade shape.
  // Idempotent via mca_ref.
  await seedSampleImports(db);
  await seedSampleExports(db);

  // Ten sample licenses across the workflow states (issued /
  // approved / pending / cancelled) so /licenses/dashboard's status
  // breakdown shows real values. Direct inserts bypass case-runtime;
  // the workflow gates transitions, not creation-with-state.
  await seedSampleLicenses(db);

  // Ten sample quotations (header rows only, no line items) so
  // /quotations/dashboard shows real totals. Mix of USD-only exports
  // and USD+CDF import-definitive quotations. Line-item seeding
  // would need to go through buildQuotation() — deferred; real
  // quotations get created via /quotations/new anyway.
  await seedSampleQuotations(db);
}

export {
  seedBootstrapRole,
  seedFieldValidations,
  seedLicenseTypes,
  seedLicenseStatuses,
  seedLicenseRules,
  seedLicenseForm,
  seedLicenseWorkflow,
  seedLicenseCaseTemplate,
  seedInvoiceStatuses,
  seedInvoiceForm,
  seedInvoiceWorkflow,
  seedInvoiceCaseTemplate,
  seedTrackingTemplates,
  seedPaymentStageRoles,
  seedCreditNoteStatuses,
  seedCreditNoteForm,
  seedCreditNoteWorkflow,
  seedCreditNoteCaseTemplate,
  seedTrackingStatuses,
  seedTrackingForm,
  seedTrackingWorkflow,
  seedTrackingCaseTemplate,
  seedTaxRules,
  seedReportForms,
  seedReportDefinitions,
  seedMenus,
  seedDashboardCards,
  seedApplicationSettings,
  seedSampleClients,
  seedSampleImports,
  seedSampleExports,
  seedSampleLicenses,
  seedSampleQuotations,
};
