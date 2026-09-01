import { NextRequest } from 'next/server';
import { and, eq, ne, sql, type SQL } from 'drizzle-orm';
import { type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import {
  paymentMethodMaster,
  paymentTermMaster,
  clearingBasisMaster,
  banklistMaster,
  kindMaster,
  currencyMaster,
  departmentMaster,
  documentStatusMaster,
  clearanceMaster,
  clearingStatusMaster,
  truckStatusMaster,
  transitPointMaster,
  transportModeMaster,
  unitMaster,
  regimeMaster,
  expenseTypeMaster,
  commodityMaster,
  typeOfGoodsMaster,
  originMaster,
  industryMaster,
  groupCompanyMaster,
  doneByMaster,
  feetContainerMaster,
  hscodeMaster,
  incotermMaster,
  provinceMaster,
  phaseMaster,
  refererMaster,
  paymentTypeMaster,
  paymentSubtypeMaster,
  partialMaster,
  subOfficeMaster,
  mainOfficeMaster,
  officeLocationMaster,
  itemMaster,
  quotationCategoryMaster,
  invoiceBankMaster,
  clientMaster,
  masterPage,
  licenseT,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';

// GET /api/v1/uniqueness/{resource}?name=foo&exclude_id=42
//
// Generic live-check endpoint backing the useUniqueCheck hook on
// admin form modals. Returns `{ available: boolean, conflict_id: number | null }`.
//
// The resource whitelist is code-defined (not a master table) so a
// typo in the URL can't quietly target the wrong column, and adding
// a new resource is a one-line edit. Composite-key entities
// (users, bank_exchange_rate, role_menu_mapping) are intentionally
// absent — uniqueness across multiple columns isn't a debounced-
// text-input check.
//
// `display = 'Y'` filter is applied so a soft-deleted row with the
// same name doesn't block a re-create.

interface ResourceConfig {
  table: PgTable;
  nameColumn: PgColumn;
  idColumn: PgColumn;
  displayColumn?: PgColumn;
  /**
   * Optional scoping column — when set, the request must supply
   * `?scope_id=N` and uniqueness is checked within rows where this
   * column equals that value. Used for nested masters like
   * `payment-subtypes` where the name only has to be unique within
   * a single parent `payment_type_id`.
   */
  scopeColumn?: PgColumn;
}

const RESOURCES: Record<string, ResourceConfig> = {
  // Quotation prereqs.
  kinds: {
    table: kindMaster,
    nameColumn: kindMaster.kindName,
    idColumn: kindMaster.id,
    displayColumn: kindMaster.display,
  },
  currencies: {
    table: currencyMaster,
    nameColumn: currencyMaster.currencyName,
    idColumn: currencyMaster.id,
    displayColumn: currencyMaster.display,
  },
  units: {
    table: unitMaster,
    nameColumn: unitMaster.unitName,
    idColumn: unitMaster.id,
    displayColumn: unitMaster.display,
  },
  'transport-modes': {
    table: transportModeMaster,
    nameColumn: transportModeMaster.transportModeName,
    idColumn: transportModeMaster.id,
    displayColumn: transportModeMaster.display,
  },
  'goods-types': {
    table: typeOfGoodsMaster,
    nameColumn: typeOfGoodsMaster.goodsType,
    idColumn: typeOfGoodsMaster.id,
    displayColumn: typeOfGoodsMaster.display,
  },
  'quotation-categories': {
    table: quotationCategoryMaster,
    nameColumn: quotationCategoryMaster.categoryName,
    idColumn: quotationCategoryMaster.id,
    displayColumn: quotationCategoryMaster.display,
  },
  items: {
    table: itemMaster,
    nameColumn: itemMaster.itemName,
    idColumn: itemMaster.id,
    displayColumn: itemMaster.display,
  },

  // Customs masters.
  partials: {
    table: partialMaster,
    nameColumn: partialMaster.partialName,
    idColumn: partialMaster.id,
    displayColumn: partialMaster.display,
  },
  regimes: {
    table: regimeMaster,
    nameColumn: regimeMaster.regimeName,
    idColumn: regimeMaster.id,
    displayColumn: regimeMaster.display,
  },
  clearances: {
    table: clearanceMaster,
    nameColumn: clearanceMaster.clearanceName,
    idColumn: clearanceMaster.id,
    displayColumn: clearanceMaster.display,
  },
  // §4.12 page-builder — slug must be unique across all pages.
  'master-pages': {
    table: masterPage,
    nameColumn: masterPage.slug,
    idColumn: masterPage.id,
    displayColumn: masterPage.display,
  },
  'sub-offices': {
    table: subOfficeMaster,
    nameColumn: subOfficeMaster.subOfficeName,
    idColumn: subOfficeMaster.id,
    displayColumn: subOfficeMaster.display,
  },
  'main-offices': {
    table: mainOfficeMaster,
    nameColumn: mainOfficeMaster.mainLocationName,
    idColumn: mainOfficeMaster.id,
    displayColumn: mainOfficeMaster.display,
  },
  'office-locations': {
    table: officeLocationMaster,
    nameColumn: officeLocationMaster.locationName,
    idColumn: officeLocationMaster.id,
    displayColumn: officeLocationMaster.display,
  },
  commodities: {
    table: commodityMaster,
    nameColumn: commodityMaster.commodityName,
    idColumn: commodityMaster.id,
    displayColumn: commodityMaster.display,
  },
  'transit-points': {
    table: transitPointMaster,
    nameColumn: transitPointMaster.transitPointName,
    idColumn: transitPointMaster.id,
    displayColumn: transitPointMaster.display,
  },
  'document-statuses': {
    table: documentStatusMaster,
    nameColumn: documentStatusMaster.documentStatus,
    idColumn: documentStatusMaster.id,
    displayColumn: documentStatusMaster.display,
  },
  'clearing-statuses': {
    table: clearingStatusMaster,
    nameColumn: clearingStatusMaster.clearingStatus,
    idColumn: clearingStatusMaster.id,
    displayColumn: clearingStatusMaster.display,
  },
  'feet-containers': {
    table: feetContainerMaster,
    nameColumn: feetContainerMaster.feetContainerSize,
    idColumn: feetContainerMaster.id,
    displayColumn: feetContainerMaster.display,
  },
  'truck-statuses': {
    table: truckStatusMaster,
    nameColumn: truckStatusMaster.truckStatus,
    idColumn: truckStatusMaster.id,
    displayColumn: truckStatusMaster.display,
  },

  // Client-enrichment masters.
  origins: {
    table: originMaster,
    nameColumn: originMaster.originName,
    idColumn: originMaster.id,
    displayColumn: originMaster.display,
  },
  provinces: {
    table: provinceMaster,
    nameColumn: provinceMaster.provinceName,
    idColumn: provinceMaster.id,
    displayColumn: provinceMaster.display,
  },
  industries: {
    table: industryMaster,
    nameColumn: industryMaster.industryName,
    idColumn: industryMaster.id,
    displayColumn: industryMaster.display,
  },
  'done-by': {
    table: doneByMaster,
    nameColumn: doneByMaster.doneByName,
    idColumn: doneByMaster.id,
    displayColumn: doneByMaster.display,
  },
  'group-companies': {
    table: groupCompanyMaster,
    nameColumn: groupCompanyMaster.groupCompanyName,
    idColumn: groupCompanyMaster.id,
    displayColumn: groupCompanyMaster.display,
  },
  referers: {
    table: refererMaster,
    nameColumn: refererMaster.refererName,
    idColumn: refererMaster.id,
    displayColumn: refererMaster.display,
  },

  // Finance / tariff masters.
  'expense-types': {
    table: expenseTypeMaster,
    nameColumn: expenseTypeMaster.expenseTypeName,
    idColumn: expenseTypeMaster.id,
    displayColumn: expenseTypeMaster.display,
  },
  hscodes: {
    table: hscodeMaster,
    nameColumn: hscodeMaster.hscodeNumber,
    idColumn: hscodeMaster.id,
    displayColumn: hscodeMaster.display,
  },
  banks: {
    // Note: banklist.bank_code is the column with the unique
    // constraint, but bank_name is what the live-typeahead checks
    // (the duplicate case operators worry about is two rows for
    // the same bank with different codes).
    table: banklistMaster,
    nameColumn: banklistMaster.bankName,
    idColumn: banklistMaster.id,
    displayColumn: banklistMaster.display,
  },
  'bank-codes': {
    table: banklistMaster,
    nameColumn: banklistMaster.bankCode,
    idColumn: banklistMaster.id,
    displayColumn: banklistMaster.display,
  },
  'invoice-banks': {
    table: invoiceBankMaster,
    nameColumn: invoiceBankMaster.invoiceBankName,
    idColumn: invoiceBankMaster.id,
    displayColumn: invoiceBankMaster.display,
  },

  // Operational masters.
  phases: {
    table: phaseMaster,
    nameColumn: phaseMaster.phaseName,
    idColumn: phaseMaster.id,
    displayColumn: phaseMaster.display,
  },
  'phase-codes': {
    table: phaseMaster,
    nameColumn: phaseMaster.phaseCode,
    idColumn: phaseMaster.id,
    displayColumn: phaseMaster.display,
  },
  incoterms: {
    table: incotermMaster,
    nameColumn: incotermMaster.incotermShortName,
    idColumn: incotermMaster.id,
    displayColumn: incotermMaster.display,
  },
  'payment-types': {
    table: paymentTypeMaster,
    nameColumn: paymentTypeMaster.paymentTypeName,
    idColumn: paymentTypeMaster.id,
    displayColumn: paymentTypeMaster.display,
  },
  'payment-subtypes': {
    // Scoped: subtype name only needs to be unique within the
    // parent payment_type_id (e.g. "SWIFT" can exist under both
    // "Bank transfer" and a hypothetical "International wire").
    table: paymentSubtypeMaster,
    nameColumn: paymentSubtypeMaster.paymentSubtype,
    idColumn: paymentSubtypeMaster.id,
    displayColumn: paymentSubtypeMaster.display,
    scopeColumn: paymentSubtypeMaster.paymentTypeId,
  },
  // The three masters added for the client / license / import corrections.
  'payment-methods': {
    table: paymentMethodMaster,
    nameColumn: paymentMethodMaster.paymentMethodName,
    idColumn: paymentMethodMaster.id,
    displayColumn: paymentMethodMaster.display,
  },
  'payment-terms': {
    table: paymentTermMaster,
    nameColumn: paymentTermMaster.paymentTermName,
    idColumn: paymentTermMaster.id,
    displayColumn: paymentTermMaster.display,
  },
  'clearing-bases': {
    table: clearingBasisMaster,
    nameColumn: clearingBasisMaster.clearingBasisName,
    idColumn: clearingBasisMaster.id,
    displayColumn: clearingBasisMaster.display,
  },
  departments: {
    table: departmentMaster,
    nameColumn: departmentMaster.departmentName,
    idColumn: departmentMaster.id,
    displayColumn: departmentMaster.display,
  },

  // Clients — main-parity checks both short_name (the code) and
  // company_name for uniqueness. `client-codes` stays as the resource
  // key for the short_name/code check so existing callers keep working.
  'client-codes': {
    table: clientMaster,
    nameColumn: clientMaster.shortName,
    idColumn: clientMaster.id,
    displayColumn: clientMaster.display,
  },
  'client-companies': {
    table: clientMaster,
    nameColumn: clientMaster.companyName,
    idColumn: clientMaster.id,
    displayColumn: clientMaster.display,
  },

  // A transaction entity rather than a master — the licence form checks this live
  // while the operator types, moving the answer from save time to typing time.
  // Deliberately NOT filtered by display: license_t's partial unique index on
  // license_number ignores display too, so a soft-deleted licence really does still
  // hold its number. Filtering here would report "Available" for a value the
  // database then rejects.
  'license-numbers': {
    table: licenseT,
    nameColumn: licenseT.licenseNumber,
    idColumn: licenseT.id,
  },
};

type Ctx = { params: Promise<{ resource: string }> };

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { resource } = await params;
    const config = RESOURCES[resource];
    if (!config) {
      throw new BadRequestError(`Unknown resource: ${resource}`);
    }

    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name')?.trim() ?? '';
    if (!name) {
      throw new BadRequestError('name is required');
    }
    const excludeIdRaw = searchParams.get('exclude_id');
    const excludeId = excludeIdRaw ? parseInt(excludeIdRaw, 10) : null;
    const scopeIdRaw = searchParams.get('scope_id');
    const scopeId = scopeIdRaw ? parseInt(scopeIdRaw, 10) : null;

    if (config.scopeColumn && !(scopeId && Number.isFinite(scopeId))) {
      throw new BadRequestError(
        `scope_id is required for resource: ${resource}`,
      );
    }

    // Case-insensitive exact match — operators care about visual
    // duplicates, not Postgres collation rules.
    const conds: SQL[] = [
      sql`lower(${config.nameColumn}) = lower(${name})`,
    ];
    if (config.displayColumn) {
      conds.push(eq(config.displayColumn, 'Y'));
    }
    if (config.scopeColumn && scopeId) {
      conds.push(eq(config.scopeColumn, scopeId));
    }
    if (excludeId && Number.isFinite(excludeId)) {
      conds.push(ne(config.idColumn, excludeId));
    }
    const where = and(...conds);

    const [hit] = await db
      .select({ id: config.idColumn })
      .from(config.table)
      .where(where)
      .limit(1);

    return ok({
      available: !hit,
      conflict_id: hit ? (hit.id as number) : null,
    });
  },
);
