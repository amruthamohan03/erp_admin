import { NextRequest } from 'next/server';
import { and, ne, sql, type SQL } from 'drizzle-orm';
import { type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import {
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
  doneBy,
  feetContainerMaster,
  hscodeMaster,
  incotermMaster,
  officeLocationMaster,
  mainOfficeMaster,
  provinceMaster,
  phaseMaster,
  refererMaster,
  masterPage,
} from '@/db/schema';

type ResourceConfig = {
  table: PgTable;
  nameColumn: PgColumn;
  idColumn: PgColumn;
};

/**
 * Maps URL slug → primary "name-like" column on each master that uniqueness
 * applies to. Composite-key masters (users, bank-exchange-rates, role-menu-mapping,
 * etc.) are intentionally absent — they need their own validation.
 *
 * Keep this list in sync with the UNIQUE indexes declared in
 * drizzle/0032_add_master_unique_indexes.sql.
 */
const RESOURCES: Record<string, ResourceConfig> = {
  banks:               { table: banklistMaster,         nameColumn: banklistMaster.bankName,             idColumn: banklistMaster.id },
  kinds:               { table: kindMaster,             nameColumn: kindMaster.kindName,                  idColumn: kindMaster.id },
  currencies:          { table: currencyMaster,         nameColumn: currencyMaster.currencyName,          idColumn: currencyMaster.id },
  departments:         { table: departmentMaster,       nameColumn: departmentMaster.departmentName,      idColumn: departmentMaster.id },
  'document-statuses': { table: documentStatusMaster,   nameColumn: documentStatusMaster.documentStatus,  idColumn: documentStatusMaster.id },
  clearances:          { table: clearanceMaster,        nameColumn: clearanceMaster.clearanceName,        idColumn: clearanceMaster.id },
  'clearing-statuses': { table: clearingStatusMaster,   nameColumn: clearingStatusMaster.clearingStatus,  idColumn: clearingStatusMaster.id },
  'truck-statuses':    { table: truckStatusMaster,      nameColumn: truckStatusMaster.truckStatus,        idColumn: truckStatusMaster.id },
  'transit-points':    { table: transitPointMaster,     nameColumn: transitPointMaster.transitPointName,  idColumn: transitPointMaster.id },
  'transport-modes':   { table: transportModeMaster,    nameColumn: transportModeMaster.transportModeName, idColumn: transportModeMaster.id },
  units:               { table: unitMaster,             nameColumn: unitMaster.unitName,                  idColumn: unitMaster.id },
  regimes:             { table: regimeMaster,           nameColumn: regimeMaster.regimeName,              idColumn: regimeMaster.id },
  'expense-types':     { table: expenseTypeMaster,      nameColumn: expenseTypeMaster.expenseTypeName,    idColumn: expenseTypeMaster.id },
  commodities:         { table: commodityMaster,        nameColumn: commodityMaster.commodityName,        idColumn: commodityMaster.id },
  'type-of-goods':     { table: typeOfGoodsMaster,      nameColumn: typeOfGoodsMaster.goodsType,          idColumn: typeOfGoodsMaster.id },
  origins:             { table: originMaster,           nameColumn: originMaster.originName,              idColumn: originMaster.id },
  industries:          { table: industryMaster,         nameColumn: industryMaster.industryName,          idColumn: industryMaster.id },
  'group-companies':   { table: groupCompanyMaster,     nameColumn: groupCompanyMaster.groupCompanyName,  idColumn: groupCompanyMaster.id },
  'done-by':           { table: doneBy,                 nameColumn: doneBy.doneByName,                    idColumn: doneBy.id },
  'feet-containers':   { table: feetContainerMaster,    nameColumn: feetContainerMaster.feetContainerSize, idColumn: feetContainerMaster.id },
  hscodes:             { table: hscodeMaster,           nameColumn: hscodeMaster.hscodeNumber,            idColumn: hscodeMaster.id },
  incoterms:           { table: incotermMaster,         nameColumn: incotermMaster.incotermShortName,     idColumn: incotermMaster.id },
  'office-locations':  { table: officeLocationMaster,   nameColumn: officeLocationMaster.locationName,    idColumn: officeLocationMaster.id },
  'main-offices':      { table: mainOfficeMaster,       nameColumn: mainOfficeMaster.mainLocationName,    idColumn: mainOfficeMaster.id },
  provinces:           { table: provinceMaster,         nameColumn: provinceMaster.provinceName,          idColumn: provinceMaster.id },
  phases:              { table: phaseMaster,             nameColumn: phaseMaster.phaseName,                idColumn: phaseMaster.id },
  // phase_code has its own UNIQUE index, so it gets its own slug for the live check.
  'phase-codes':       { table: phaseMaster,             nameColumn: phaseMaster.phaseCode,                idColumn: phaseMaster.id },
  referers:            { table: refererMaster,           nameColumn: refererMaster.refererName,            idColumn: refererMaster.id },
  'master-pages-slug': { table: masterPage,               nameColumn: masterPage.slug,                      idColumn: masterPage.id },
};

type Ctx = { params: Promise<{ resource: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { resource } = await params;
  const config = RESOURCES[resource];
  if (!config) return fail('Unknown resource', 400);

  const { searchParams } = new URL(req.url);
  const name = (searchParams.get('name') ?? '').trim();
  if (!name) return ok({ available: true, conflictId: null });

  const excludeIdRaw = searchParams.get('exclude_id');
  const excludeId =
    excludeIdRaw && !Number.isNaN(Number(excludeIdRaw)) ? Number(excludeIdRaw) : null;

  let where: SQL = sql`LOWER(${config.nameColumn}) = LOWER(${name})`;
  if (excludeId !== null) {
    where = and(where, ne(config.idColumn, excludeId)) as SQL;
  }

  const rows = await db
    .select({ id: config.idColumn })
    .from(config.table)
    .where(where)
    .limit(1);

  return ok({
    available: rows.length === 0,
    conflictId: rows[0]?.id ?? null,
  });
}
