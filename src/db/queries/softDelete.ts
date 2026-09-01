// §4.27 — the read/restore/destroy side of soft deletion.
//
// A registry keyed by resource slug, mirroring the vetted-whitelist approach in
// /api/v1/uniqueness (config names a resource; the SQL identifiers live here, so
// an untrusted slug can never reach the database). It is a SEPARATE map from the
// uniqueness one on purpose: that keys by *name column* and has several entries
// per table (`banks` and `bank-codes` are the same table), whereas a recycle bin
// needs exactly one entry per table.
//
// Only tables carrying a `display` flag can appear here — that flag IS the soft
// delete. 74 of the 85 tables have one.
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import {
  paymentMethodMaster,
  paymentTermMaster,
  clearingBasisMaster,
  banklistMaster,
  clearanceMaster,
  clearingStatusMaster,
  clientMaster,
  commodityMaster,
  currencyMaster,
  departmentMaster,
  documentStatusMaster,
  doneByMaster,
  expenseTypeMaster,
  feetContainerMaster,
  groupCompanyMaster,
  hscodeMaster,
  incotermMaster,
  industryMaster,
  invoiceBankMaster,
  itemMaster,
  kindMaster,
  licenseT,
  mainOfficeMaster,
  officeLocationMaster,
  originMaster,
  paymentSubtypeMaster,
  paymentTypeMaster,
  phaseMaster,
  provinceMaster,
  quotationCategoryMaster,
  refererMaster,
  regimeMaster,
  subOfficeMaster,
  transitPointMaster,
  transportModeMaster,
  truckStatusMaster,
  typeOfGoodsMaster,
  unitMaster,
} from '@/db/schema';
import { recordAudit } from '@/lib/audit/recordAudit';

export interface SoftDeleteResource {
  /** Human label for the recycle-bin picker. */
  label: string;
  /** The menu URL this resource's permissions hang off (§4.7). */
  menu: string;
  table: PgTable;
  idColumn: PgColumn;
  displayColumn: PgColumn;
  /** The column that identifies a row to a person. */
  labelColumn: PgColumn;
  /** Extra searchable columns. */
  searchColumns?: PgColumn[];
}

export const SOFT_DELETE_RESOURCES: Record<string, SoftDeleteResource> = {
  clients: {
    label: 'Clients', menu: '/masters/clients', table: clientMaster,
    idColumn: clientMaster.id, displayColumn: clientMaster.display,
    labelColumn: clientMaster.companyName, searchColumns: [clientMaster.shortName],
  },
  licenses: {
    label: 'Licenses', menu: '/licenses', table: licenseT,
    idColumn: licenseT.id, displayColumn: licenseT.display,
    labelColumn: licenseT.licenseNumber, searchColumns: [licenseT.invoiceNumber],
  },
  banks: {
    label: 'Banks', menu: '/masters/banks', table: banklistMaster,
    idColumn: banklistMaster.id, displayColumn: banklistMaster.display,
    labelColumn: banklistMaster.bankName, searchColumns: [banklistMaster.bankCode],
  },
  clearances: {
    label: 'Clearances', menu: '/masters/clearances', table: clearanceMaster,
    idColumn: clearanceMaster.id, displayColumn: clearanceMaster.display,
    labelColumn: clearanceMaster.clearanceName,
  },
  'clearing-statuses': {
    label: 'Clearing Statuses', menu: '/masters/clearing-statuses', table: clearingStatusMaster,
    idColumn: clearingStatusMaster.id, displayColumn: clearingStatusMaster.display,
    labelColumn: clearingStatusMaster.clearingStatus,
  },
  commodities: {
    label: 'Commodities', menu: '/masters/commodities', table: commodityMaster,
    idColumn: commodityMaster.id, displayColumn: commodityMaster.display,
    labelColumn: commodityMaster.commodityName,
  },
  currencies: {
    label: 'Currencies', menu: '/masters/currencies', table: currencyMaster,
    idColumn: currencyMaster.id, displayColumn: currencyMaster.display,
    labelColumn: currencyMaster.currencyName, searchColumns: [currencyMaster.currencyShortName],
  },
  departments: {
    label: 'Departments', menu: '/masters/departments', table: departmentMaster,
    idColumn: departmentMaster.id, displayColumn: departmentMaster.display,
    labelColumn: departmentMaster.departmentName,
  },
  'document-statuses': {
    label: 'Document Statuses', menu: '/masters/document-statuses', table: documentStatusMaster,
    idColumn: documentStatusMaster.id, displayColumn: documentStatusMaster.display,
    labelColumn: documentStatusMaster.documentStatus,
  },
  'done-by': {
    label: 'Done By', menu: '/masters/done-by', table: doneByMaster,
    idColumn: doneByMaster.id, displayColumn: doneByMaster.display,
    labelColumn: doneByMaster.doneByName,
  },
  'expense-types': {
    label: 'Expense Types', menu: '/masters/expense-types', table: expenseTypeMaster,
    idColumn: expenseTypeMaster.id, displayColumn: expenseTypeMaster.display,
    labelColumn: expenseTypeMaster.expenseTypeName,
  },
  'feet-containers': {
    label: 'Container Sizes', menu: '/masters/feet-containers', table: feetContainerMaster,
    idColumn: feetContainerMaster.id, displayColumn: feetContainerMaster.display,
    labelColumn: feetContainerMaster.feetContainerSize,
  },
  'goods-types': {
    label: 'Goods Types', menu: '/masters/goods-types', table: typeOfGoodsMaster,
    idColumn: typeOfGoodsMaster.id, displayColumn: typeOfGoodsMaster.display,
    labelColumn: typeOfGoodsMaster.goodsType,
  },
  'group-companies': {
    label: 'Group Companies', menu: '/masters/group-companies', table: groupCompanyMaster,
    idColumn: groupCompanyMaster.id, displayColumn: groupCompanyMaster.display,
    labelColumn: groupCompanyMaster.groupCompanyName,
  },
  hscodes: {
    label: 'HS Codes', menu: '/masters/hscodes', table: hscodeMaster,
    idColumn: hscodeMaster.id, displayColumn: hscodeMaster.display,
    labelColumn: hscodeMaster.hscodeNumber,
  },
  incoterms: {
    label: 'Incoterms', menu: '/masters/incoterms', table: incotermMaster,
    idColumn: incotermMaster.id, displayColumn: incotermMaster.display,
    labelColumn: incotermMaster.incotermShortName,
  },
  industries: {
    label: 'Industries', menu: '/masters/industries', table: industryMaster,
    idColumn: industryMaster.id, displayColumn: industryMaster.display,
    labelColumn: industryMaster.industryName,
  },
  'invoice-banks': {
    label: 'Invoice Banks', menu: '/masters/invoice-banks', table: invoiceBankMaster,
    idColumn: invoiceBankMaster.id, displayColumn: invoiceBankMaster.display,
    labelColumn: invoiceBankMaster.invoiceBankName,
  },
  items: {
    label: 'Items', menu: '/masters/items', table: itemMaster,
    idColumn: itemMaster.id, displayColumn: itemMaster.display,
    labelColumn: itemMaster.itemName,
  },
  // The three masters added for the client / license / import corrections.
  // Every one carries a `display` flag, so §4.27 puts them in the Recycle Bin
  // alongside the rest.
  'payment-methods': {
    label: 'Payment Methods', menu: '/masters/payment-methods', table: paymentMethodMaster,
    idColumn: paymentMethodMaster.id, displayColumn: paymentMethodMaster.display,
    labelColumn: paymentMethodMaster.paymentMethodName,
  },
  'payment-terms': {
    label: 'Payment Terms', menu: '/masters/payment-terms', table: paymentTermMaster,
    idColumn: paymentTermMaster.id, displayColumn: paymentTermMaster.display,
    labelColumn: paymentTermMaster.paymentTermName,
  },
  'clearing-bases': {
    label: 'Clearing Bases', menu: '/masters/clearing-bases', table: clearingBasisMaster,
    idColumn: clearingBasisMaster.id, displayColumn: clearingBasisMaster.display,
    labelColumn: clearingBasisMaster.clearingBasisName,
  },
  kinds: {
    label: 'Kinds', menu: '/masters/kinds', table: kindMaster,
    idColumn: kindMaster.id, displayColumn: kindMaster.display,
    labelColumn: kindMaster.kindName,
  },
  'main-offices': {
    label: 'Main Offices', menu: '/masters/main-offices', table: mainOfficeMaster,
    idColumn: mainOfficeMaster.id, displayColumn: mainOfficeMaster.display,
    labelColumn: mainOfficeMaster.mainLocationName,
  },
  'office-locations': {
    label: 'Office Locations', menu: '/masters/office-locations', table: officeLocationMaster,
    idColumn: officeLocationMaster.id, displayColumn: officeLocationMaster.display,
    labelColumn: officeLocationMaster.locationName,
  },
  origins: {
    label: 'Origins', menu: '/masters/origins', table: originMaster,
    idColumn: originMaster.id, displayColumn: originMaster.display,
    labelColumn: originMaster.originName,
  },
  'payment-subtypes': {
    label: 'Payment Subtypes', menu: '/masters/payment-subtypes', table: paymentSubtypeMaster,
    idColumn: paymentSubtypeMaster.id, displayColumn: paymentSubtypeMaster.display,
    labelColumn: paymentSubtypeMaster.paymentSubtype,
  },
  'payment-types': {
    label: 'Payment Types', menu: '/masters/payment-types', table: paymentTypeMaster,
    idColumn: paymentTypeMaster.id, displayColumn: paymentTypeMaster.display,
    labelColumn: paymentTypeMaster.paymentTypeName,
  },
  phases: {
    label: 'Phases', menu: '/masters/phases', table: phaseMaster,
    idColumn: phaseMaster.id, displayColumn: phaseMaster.display,
    labelColumn: phaseMaster.phaseName, searchColumns: [phaseMaster.phaseCode],
  },
  provinces: {
    label: 'Provinces', menu: '/masters/provinces', table: provinceMaster,
    idColumn: provinceMaster.id, displayColumn: provinceMaster.display,
    labelColumn: provinceMaster.provinceName,
  },
  'quotation-categories': {
    label: 'Quotation Categories', menu: '/masters/quotation-categories', table: quotationCategoryMaster,
    idColumn: quotationCategoryMaster.id, displayColumn: quotationCategoryMaster.display,
    labelColumn: quotationCategoryMaster.categoryName,
  },
  referers: {
    label: 'Referrers', menu: '/masters/referers', table: refererMaster,
    idColumn: refererMaster.id, displayColumn: refererMaster.display,
    labelColumn: refererMaster.refererName,
  },
  regimes: {
    label: 'Regimes', menu: '/masters/regimes', table: regimeMaster,
    idColumn: regimeMaster.id, displayColumn: regimeMaster.display,
    labelColumn: regimeMaster.regimeName,
  },
  'sub-offices': {
    label: 'Sub Offices', menu: '/masters/sub-offices', table: subOfficeMaster,
    idColumn: subOfficeMaster.id, displayColumn: subOfficeMaster.display,
    labelColumn: subOfficeMaster.subOfficeName,
  },
  'transit-points': {
    label: 'Transit Points', menu: '/masters/transit-points', table: transitPointMaster,
    idColumn: transitPointMaster.id, displayColumn: transitPointMaster.display,
    labelColumn: transitPointMaster.transitPointName,
  },
  'transport-modes': {
    label: 'Transport Modes', menu: '/masters/transport-modes', table: transportModeMaster,
    idColumn: transportModeMaster.id, displayColumn: transportModeMaster.display,
    labelColumn: transportModeMaster.transportModeName,
  },
  'truck-statuses': {
    label: 'Truck Statuses', menu: '/masters/truck-statuses', table: truckStatusMaster,
    idColumn: truckStatusMaster.id, displayColumn: truckStatusMaster.display,
    labelColumn: truckStatusMaster.truckStatus,
  },
  units: {
    label: 'Units', menu: '/masters/units', table: unitMaster,
    idColumn: unitMaster.id, displayColumn: unitMaster.display,
    labelColumn: unitMaster.unitName, searchColumns: [unitMaster.unitCode],
  },
};

export function getSoftDeleteResource(key: string): SoftDeleteResource | null {
  return SOFT_DELETE_RESOURCES[key] ?? null;
}

export interface DeletedRow {
  id: number;
  label: string;
}

/** One recycle-bin page: the soft-deleted rows of a resource. */
export async function listDeleted(
  resource: SoftDeleteResource,
  opts: { page: number; pageSize: number; q?: string },
): Promise<{ items: DeletedRow[]; total: number }> {
  const conds: SQL[] = [eq(resource.displayColumn, 'N')];
  const term = opts.q?.trim();
  if (term) {
    const like = `%${term}%`;
    const cols = [resource.labelColumn, ...(resource.searchColumns ?? [])];
    const matches = cols.map((c) => ilike(c, like));
    // `or` needs at least two operands to be meaningful; one column is just ilike.
    conds.push(matches.length > 1 ? (or(...matches) as SQL) : matches[0]);
  }
  const where = and(...conds);

  const [countRow] = await db.select({ total: count() }).from(resource.table).where(where);
  const rows = await db
    .select({ id: resource.idColumn, label: resource.labelColumn })
    .from(resource.table)
    .where(where)
    .orderBy(desc(resource.idColumn))
    .limit(opts.pageSize)
    .offset((opts.page - 1) * opts.pageSize);

  return {
    items: rows.map((r) => ({ id: Number(r.id), label: String(r.label ?? `#${r.id}`) })),
    total: Number(countRow?.total ?? 0),
  };
}

/** How many rows each resource is holding — drives the recycle-bin index. */
export async function deletedCounts(): Promise<Array<{ key: string; label: string; menu: string; count: number }>> {
  const entries = Object.entries(SOFT_DELETE_RESOURCES);
  const counts = await Promise.all(
    entries.map(async ([key, r]) => {
      const [row] = await db.select({ total: count() }).from(r.table).where(eq(r.displayColumn, 'N'));
      return { key, label: r.label, menu: r.menu, count: Number(row?.total ?? 0) };
    }),
  );
  return counts.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export class SoftDeleteError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
    this.name = 'SoftDeleteError';
  }
}

/** Put a soft-deleted row back into circulation. */
export async function restoreRow(
  resourceKey: string,
  resource: SoftDeleteResource,
  id: number,
  actorId: number,
): Promise<{ id: number; label: string }> {
  const [current] = await db
    .select({ display: resource.displayColumn, label: resource.labelColumn })
    .from(resource.table)
    .where(eq(resource.idColumn, id))
    .limit(1);

  if (!current) throw new SoftDeleteError('That record no longer exists.', 404);
  if (current.display === 'Y') {
    throw new SoftDeleteError('That record is already active — nothing to restore.');
  }

  const label = String(current.label ?? `#${id}`);
  await db.transaction(async (tx) => {
    await tx
      .update(resource.table)
      .set({ [resource.displayColumn.name]: 'Y' })
      .where(eq(resource.idColumn, id));
    // §4.28 — restore is one of the logged actions, in the same transaction.
    await recordAudit(tx, {
      actorId,
      action: 'restore',
      entityType: `recycle-bin:${resourceKey}`,
      entityId: String(id),
      before: { display: 'N' },
      after: { display: 'Y' },
      metadata: { operation: 'restore', label },
    });
  });

  return { id, label };
}

/**
 * Destroy a row for good.
 *
 * The only path in the app that can lose data, so it checks that the row is
 * already soft-deleted first: permanent delete is a second decision about
 * something already withdrawn, never a shortcut past the first one. A foreign-key
 * violation is reported as "still referenced" rather than a 500 — §4.27 requires
 * that related rows be handled explicitly rather than orphaned.
 */
export async function permanentlyDeleteRow(
  resourceKey: string,
  resource: SoftDeleteResource,
  id: number,
  actorId: number,
  /** Must match the row's own label — see the route for why. */
  confirm: string,
): Promise<{ id: number; label: string }> {
  const [current] = await db
    .select({ display: resource.displayColumn, label: resource.labelColumn })
    .from(resource.table)
    .where(eq(resource.idColumn, id))
    .limit(1);

  if (!current) throw new SoftDeleteError('That record no longer exists.', 404);
  if (current.display !== 'N') {
    throw new SoftDeleteError(
      'Only a deleted record can be permanently removed. Delete it first, then remove it from the recycle bin.',
    );
  }

  const label = String(current.label ?? `#${id}`);

  // Compared here rather than in the route: the label is read in this function,
  // so there is no window in which the value confirmed differs from the value
  // deleted, and no caller can skip the check by not passing it.
  if (confirm.trim() !== label.trim()) {
    throw new SoftDeleteError(
      `To permanently delete this record, type its name exactly: "${label}".`,
    );
  }

  try {
    await db.transaction(async (tx) => {
      // Audit BEFORE the delete: the row still exists to be described, and the
      // entry has to survive the thing it describes.
      await recordAudit(tx, {
        actorId,
        action: 'permanent_delete',
        entityType: `recycle-bin:${resourceKey}`,
        entityId: String(id),
        before: { display: 'N', label },
        after: null,
        metadata: { operation: 'permanent_delete', label },
      });
      await tx.delete(resource.table).where(eq(resource.idColumn, id));
    });
  } catch (err) {
    const cause = (err as { cause?: unknown }).cause ?? err;
    const code = (cause as { code?: string }).code;
    if (code === '23503') {
      throw new SoftDeleteError(
        `"${label}" is still referenced by other records, so it cannot be permanently removed. It stays in the recycle bin, where history can still resolve it.`,
        409,
      );
    }
    throw err;
  }

  return { id, label };
}
