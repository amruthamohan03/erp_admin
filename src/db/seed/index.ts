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
import { seedCreditNoteStatuses } from './creditNoteStatuses';
import { seedCreditNoteForm } from './creditNoteForm';
import { seedCreditNoteWorkflow } from './creditNoteWorkflow';
import { seedCreditNoteCaseTemplate } from './creditNoteCaseTemplate';
import { seedCreditNotesMenu } from './creditNotesMenu';
import { seedTrackingStatuses } from './trackingStatuses';
import { seedTrackingForm } from './trackingForm';
import { seedTrackingWorkflow } from './trackingWorkflow';
import { seedTrackingCaseTemplate } from './trackingCaseTemplate';
import { seedTrackingMenu } from './trackingMenu';
import { seedTaxRules } from './taxRules';
import { seedFicheDeCalculMenu } from './ficheDeCalculMenu';
import { seedReportForms } from './reportForms';
import { seedReportDefinitions } from './reportDefinitions';
import { seedReportsMenu } from './reportsMenu';
import { seedFieldGrantsMappingMenu } from './fieldGrantsMappingMenu';
import { seedClientsMenu } from './clientsMenu';
import { seedOfficesMenu } from './officesMenu';
import { seedSealsMenu } from './sealsMenu';
import { seedCurrenciesMenu } from './currenciesMenu';
import { seedUnitsMenu } from './unitsMenu';
import { seedKindsMenu } from './kindsMenu';
import { seedTransportModesMenu } from './transportModesMenu';
import { seedGoodsTypesMenu } from './goodsTypesMenu';
import { seedQuotationCategoriesMenu } from './quotationCategoriesMenu';
import { seedItemsMenu } from './itemsMenu';
import { seedQuotationsMenu } from './quotationsMenu';
import { seedBulkUpdateMenu } from './bulkUpdateMenu';
import { seedPartialsMenu } from './partialsMenu';
import { seedClearancesMenu } from './clearancesMenu';
import { seedSubOfficesMenu } from './subOfficesMenu';
import { seedCommoditiesMenu } from './commoditiesMenu';
import { seedClearingStatusesMenu } from './clearingStatusesMenu';
import { seedRegimesMenu } from './regimesMenu';
import { seedDocumentStatusesMenu } from './documentStatusesMenu';
import { seedTransitPointsMenu } from './transitPointsMenu';
import { seedImportsMenu } from './importsMenu';
import { seedFeetContainersMenu } from './feetContainersMenu';
import { seedTruckStatusesMenu } from './truckStatusesMenu';
import { seedExportsMenu } from './exportsMenu';
import { seedOriginsMenu } from './originsMenu';
import { seedProvincesMenu } from './provincesMenu';
import { seedIndustriesMenu } from './industriesMenu';
import { seedDoneByMenu } from './doneByMenu';
import { seedExpenseTypesMenu } from './expenseTypesMenu';
import { seedHscodesMenu } from './hscodesMenu';
import { seedBanksMenu } from './banksMenu';
import { seedBankExchangeRatesMenu } from './bankExchangeRatesMenu';

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

  // --- Tracking module (§2 step 3) ------------------------------------
  // Statuses + form + workflow + case_template for tracking_t. Per-milestone
  // advancement (current_milestone_key bumps inside in_progress) lives on a
  // separate endpoint — kept off the case-runtime so the template's
  // milestones_json can change without rewriting workflow transitions.
  await seedTrackingStatuses(db);
  await seedTrackingForm(db);
  await seedTrackingWorkflow(db);
  await seedTrackingCaseTemplate(db); // depends on trackingForm + trackingWorkflow

  // --- Fiche de Calcul (§2 step 3 / §4.1) -----------------------------
  // Sample DRC tax rules. The compute endpoint composes them via
  // loadTaxRule + applyRule — no new transactional table; rules are read
  // every call so admins can edit them without restarting the app.
  await seedTaxRules(db);

  // --- Invoice module (§2 step 4) -------------------------------------
  await seedInvoiceStatuses(db);
  await seedInvoiceForm(db); // depends on fieldValidations (iso.currency_code)
  await seedInvoiceWorkflow(db);
  await seedInvoiceCaseTemplate(db);

  // --- Credit Note module (§2 step 5) ---------------------------------
  // credit_note_t.invoice_id is a NOT NULL FK to invoice_t — the schema-level
  // dependency. Seed order also follows §2 (after invoice, before payment).
  await seedCreditNoteStatuses(db);
  await seedCreditNoteForm(db); // depends on fieldValidations (iso.currency_code)
  await seedCreditNoteWorkflow(db);
  await seedCreditNoteCaseTemplate(db);

  // --- Payment Request module (§2 step 6) -----------------------------
  // Approvals must seed before the workflow (transitions reference the
  // hierarchy by key from action_json).
  await seedPaymentRequestApprovals(db);
  await seedPaymentRequestStatuses(db);
  await seedPaymentRequestForm(db); // depends on fieldValidations
  await seedPaymentRequestWorkflow(db); // depends on approvals
  await seedPaymentRequestCaseTemplate(db);

  // --- Reports (§2 step 7) --------------------------------------------
  // Parameter forms must seed before definitions (formId FK).
  await seedReportForms(db);
  await seedReportDefinitions(db);

  // Sidebar entries + permission grants. Last so the navigation lights up
  // only after every route it points at is real.
  await seedLicensesMenu(db);
  await seedTrackingMenu(db);
  await seedFicheDeCalculMenu(db);
  await seedInvoicesMenu(db);
  await seedCreditNotesMenu(db);
  await seedPaymentRequestsMenu(db);
  await seedReportsMenu(db);
  await seedFieldGrantsMappingMenu(db);
  await seedClientsMenu(db);
  await seedOfficesMenu(db);
  await seedSealsMenu(db);
  // Quotations prereq lookup masters — sidebar order 30-34.
  await seedCurrenciesMenu(db);
  await seedUnitsMenu(db);
  await seedKindsMenu(db);
  await seedTransportModesMenu(db);
  await seedGoodsTypesMenu(db);
  // Quotations-domain masters that depend on the simple lookups above.
  await seedQuotationCategoriesMenu(db);
  await seedItemsMenu(db);
  await seedQuotationsMenu(db);
  await seedBulkUpdateMenu(db);
  // Customs-domain prereq masters (Imports / Exports port unblockers).
  await seedPartialsMenu(db);
  await seedClearancesMenu(db);
  await seedSubOfficesMenu(db);
  await seedCommoditiesMenu(db);
  await seedClearingStatusesMenu(db);
  await seedRegimesMenu(db);
  await seedDocumentStatusesMenu(db);
  await seedTransitPointsMenu(db);
  // Imports module (§2 step 3 — customs imports lifecycle).
  await seedImportsMenu(db);
  // Exports prereq masters (feet_container + truck_status).
  await seedFeetContainersMenu(db);
  await seedTruckStatusesMenu(db);
  // Exports module (§2 step 3 — customs exports lifecycle).
  await seedExportsMenu(db);
  // Client-enrichment masters (origin → province; industry; done-by).
  await seedOriginsMenu(db);
  await seedProvincesMenu(db);
  await seedIndustriesMenu(db);
  await seedDoneByMenu(db);
  // Finance / tariff masters (expense_type + hscode).
  await seedExpenseTypesMenu(db);
  await seedHscodesMenu(db);
  // Bank cluster — registry + daily exchange-rate entries.
  await seedBanksMenu(db);
  await seedBankExchangeRatesMenu(db);
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
  seedCreditNoteStatuses,
  seedCreditNoteForm,
  seedCreditNoteWorkflow,
  seedCreditNoteCaseTemplate,
  seedCreditNotesMenu,
  seedTrackingStatuses,
  seedTrackingForm,
  seedTrackingWorkflow,
  seedTrackingCaseTemplate,
  seedTrackingMenu,
  seedTaxRules,
  seedFicheDeCalculMenu,
  seedReportForms,
  seedReportDefinitions,
  seedReportsMenu,
  seedFieldGrantsMappingMenu,
  seedClientsMenu,
  seedOfficesMenu,
  seedSealsMenu,
  seedCurrenciesMenu,
  seedUnitsMenu,
  seedKindsMenu,
  seedTransportModesMenu,
  seedGoodsTypesMenu,
  seedQuotationCategoriesMenu,
  seedItemsMenu,
  seedQuotationsMenu,
  seedBulkUpdateMenu,
  seedPartialsMenu,
  seedClearancesMenu,
  seedSubOfficesMenu,
  seedCommoditiesMenu,
  seedClearingStatusesMenu,
  seedRegimesMenu,
  seedDocumentStatusesMenu,
  seedTransitPointsMenu,
  seedImportsMenu,
  seedFeetContainersMenu,
  seedTruckStatusesMenu,
  seedExportsMenu,
  seedOriginsMenu,
  seedProvincesMenu,
  seedIndustriesMenu,
  seedDoneByMenu,
  seedExpenseTypesMenu,
  seedHscodesMenu,
  seedBanksMenu,
  seedBankExchangeRatesMenu,
};
