import type { PgTable } from 'drizzle-orm/pg-core';
import {
  banklistMaster,
  clearanceMaster,
  clearingBasisMaster,
  clearingStatusMaster,
  commodityMaster,
  currencyMaster,
  dashboardCardMaster,
  departmentMaster,
  documentStatusMaster,
  doneByMaster,
  drcHolidays,
  expenseTypeMaster,
  feetContainerMaster,
  groupCompanyMaster,
  hscodeMaster,
  incotermMaster,
  industryMaster,
  invoiceBankMaster,
  itemMaster,
  kindMaster,
  mainOfficeMaster,
  masterPage,
  menuMaster,
  officeLocationMaster,
  originMaster,
  paymentMethodMaster,
  paymentTermMaster,
  phaseMaster,
  provinceMaster,
  quotationCategoryMaster,
  refererMaster,
  regimeMaster,
  roleMaster,
  sealBatch,
  subOfficeMaster,
  transitPointMaster,
  transportModeMaster,
  truckStatusMaster,
  typeOfGoodsMaster,
  unitMaster,
} from '@/db/schema';

// §4.1/§4.10 — every master screen exports to Excel through ONE route
// (/api/v1/masters/{source}/export), driven by this registry.
//
// The alternative was 40 more bespoke export routes, each repeating the same
// select / filter / format / audit / workbook code, and each free to drift from
// the others in column set, date format and filename. That is precisely the
// duplication §4.10 calls a defect. One implementation means one place to fix a
// bug and one answer to "what does an export of this screen contain".
//
// A CLOSED registry rather than a lookup by table name, for the same reason
// `mca_ref_format_master_t` names a vetted target key rather than a table
// (§4.33): `/masters/{anything}/export` must not become a way to read an
// arbitrary table over HTTP. A slug that is not listed here is a 404.
//
// Two masters are deliberately ABSENT because they already have their own
// export, and those do more than this one can: `clients` and `users` join to
// resolve role / location / department names, which a generic column dump
// cannot. Extending a shared helper beats forking it (§4.10), but a helper that
// tried to express arbitrary joins as config would be a worse thing than two
// hand-written routes.

export interface MasterExport {
  /** The table whose rows the screen lists. */
  table: PgTable;
  /** Sheet name and filename stem — what the operator sees in Excel. */
  label: string;
}

export const MASTER_EXPORTS: Record<string, MasterExport> = {
  banks: { table: banklistMaster, label: 'Banks' },
  clearances: { table: clearanceMaster, label: 'Clearances' },
  'clearing-bases': { table: clearingBasisMaster, label: 'Clearing Bases' },
  'clearing-statuses': { table: clearingStatusMaster, label: 'Clearing Statuses' },
  commodities: { table: commodityMaster, label: 'Commodities' },
  currencies: { table: currencyMaster, label: 'Currencies' },
  'dashboard-cards': { table: dashboardCardMaster, label: 'Dashboard Cards' },
  departments: { table: departmentMaster, label: 'Departments' },
  'document-statuses': { table: documentStatusMaster, label: 'Document Statuses' },
  'done-by': { table: doneByMaster, label: 'Done By' },
  'drc-holidays': { table: drcHolidays, label: 'DRC Public Holidays' },
  'expense-types': { table: expenseTypeMaster, label: 'Expense Types' },
  'feet-containers': { table: feetContainerMaster, label: 'Feet Containers' },
  'goods-types': { table: typeOfGoodsMaster, label: 'Type of Goods' },
  'group-companies': { table: groupCompanyMaster, label: 'Group Companies' },
  hscodes: { table: hscodeMaster, label: 'HS Codes' },
  incoterms: { table: incotermMaster, label: 'Incoterms' },
  industries: { table: industryMaster, label: 'Industries' },
  'invoice-banks': { table: invoiceBankMaster, label: 'Invoice Banks' },
  items: { table: itemMaster, label: 'Items' },
  kinds: { table: kindMaster, label: 'Kinds' },
  'main-offices': { table: mainOfficeMaster, label: 'Main Offices' },
  'master-pages': { table: masterPage, label: 'Pages' },
  menus: { table: menuMaster, label: 'Menus' },
  'office-locations': { table: officeLocationMaster, label: 'Office Locations' },
  origins: { table: originMaster, label: 'Origins' },
  'payment-methods': { table: paymentMethodMaster, label: 'Payment Methods' },
  'payment-terms': { table: paymentTermMaster, label: 'Payment Terms' },
  phases: { table: phaseMaster, label: 'Phases' },
  provinces: { table: provinceMaster, label: 'Provinces' },
  'quotation-categories': { table: quotationCategoryMaster, label: 'Quotation Categories' },
  referers: { table: refererMaster, label: 'Referers' },
  regimes: { table: regimeMaster, label: 'Regimes' },
  roles: { table: roleMaster, label: 'Roles' },
  seals: { table: sealBatch, label: 'Seal Batches' },
  'sub-offices': { table: subOfficeMaster, label: 'Declaration Offices' },
  'transit-points': { table: transitPointMaster, label: 'Transit Points' },
  'transport-modes': { table: transportModeMaster, label: 'Transport Modes' },
  'truck-statuses': { table: truckStatusMaster, label: 'Truck Statuses' },
  units: { table: unitMaster, label: 'Units' },
};

/**
 * Columns never written to a spreadsheet, whatever table it came from.
 *
 * A sheet leaves the office (§4.15's reasoning about exports), so this is the
 * boundary where secrets and internal bookkeeping stop rather than something to
 * strip afterwards:
 *
 *   - credentials, in any of the spellings the tables use;
 *   - upload paths, which are server filesystem detail and useless off-machine;
 *   - `created_by` / `updated_by`, which are user IDs a reader cannot resolve —
 *     the audit log is where "who changed this" is answered (§4.28);
 *   - the primary key, per §4.9: it leaks nothing useful to an operator and
 *     changes meaning the moment the list is filtered. Excel numbers the rows.
 */
export const EXPORT_EXCLUDED_COLUMNS: ReadonlySet<string> = new Set([
  'id',
  'password',
  'password_hash',
  'profile_image',
  'signature_image',
  'logo_url',
  'favicon_url',
  'created_by',
  'updated_by',
]);
