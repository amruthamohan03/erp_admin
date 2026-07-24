// Bivac / PARTIELLE balance queries (§7.4). All the "used" and "remaining"
// figures are DERIVED here — never stored — so the numbers can never drift
// from the underlying licences/imports:
//   • licence capacity  → license_t columns
//   • used              → SUM(imports_t.*) WHERE inspection_reports = partial_name
//   • balance/remaining → capacity − used (computed in SQL)
// Imports link to a PARTIELLE by name (imports_t.inspection_reports), matching
// main's model.
import { and, eq, ne, or, ilike, sql, count, desc, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { licenseT, clientMaster, currencyMaster, typeOfGoodsMaster, bivacPartial } from '@/db/schema';

// ---- Licences list (import kinds 1,2) with allocation + usage rollups --------

export interface BivacLicenseRow {
  id: number;
  license_number: string | null;
  ref_cod: string | null;
  client_name: string | null;
  currency_name: string | null;
  type_of_goods_name: string | null;
  weight: number;
  fob_declared: number;
  insurance: number;
  freight: number;
  other_costs: number;
  partielle_count: number;
  total_used_weight: number;
  total_used_fob: number;
  balance_weight: number;
  balance_fob: number;
}

function licenseSearch(qLike: string | null): SQL | undefined {
  if (!qLike) return undefined;
  return or(
    ilike(licenseT.licenseNumber, qLike),
    ilike(licenseT.refCod, qLike),
    ilike(clientMaster.shortName, qLike),
    ilike(currencyMaster.currencyShortName, qLike),
    ilike(typeOfGoodsMaster.goodsType, qLike),
  );
}

function licenseWhere(clientId?: number, q?: string): SQL {
  const conds: SQL[] = [eq(licenseT.display, 'Y'), sql`${licenseT.kindId} IN (1, 2)`];
  if (clientId) conds.push(eq(licenseT.clientId, clientId));
  const s = licenseSearch(q?.trim() ? `%${q.trim()}%` : null);
  if (s) conds.push(s);
  return and(...conds) as SQL;
}

export async function countBivacLicenses(clientId?: number, q?: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(licenseT)
    .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
    .leftJoin(currencyMaster, eq(currencyMaster.id, licenseT.currencyId))
    .leftJoin(typeOfGoodsMaster, eq(typeOfGoodsMaster.id, licenseT.typeOfGoodsId))
    .where(licenseWhere(clientId, q));
  return row?.total ?? 0;
}

// A scalar subquery summing one imports_t column across every import linked to
// any active PARTIELLE of the licence row `l`.
function usedSum(col: 'weight' | 'fob'): SQL<string> {
  return sql<string>`(
    SELECT COALESCE(SUM(i.${sql.raw(col)}), 0)
    FROM imports_t i
    INNER JOIN bivac_partial_t p ON i.inspection_reports = p.partial_name
    WHERE p.license_id = ${licenseT.id} AND p.display = 'Y' AND i.display = 'Y'
  )`;
}

export async function listBivacLicenses(
  clientId: number | undefined,
  q: string | undefined,
  limit: number,
  offset: number,
): Promise<BivacLicenseRow[]> {
  const usedWeight = usedSum('weight');
  const usedFob = usedSum('fob');
  const rows = await db
    .select({
      id: licenseT.id,
      license_number: licenseT.licenseNumber,
      ref_cod: licenseT.refCod,
      client_name: clientMaster.shortName,
      currency_name: currencyMaster.currencyShortName,
      type_of_goods_name: typeOfGoodsMaster.goodsType,
      weight: sql<number>`COALESCE(${licenseT.weight}, 0)::float`,
      fob_declared: sql<number>`COALESCE(${licenseT.fobDeclared}, 0)::float`,
      insurance: sql<number>`COALESCE(${licenseT.insurance}, 0)::float`,
      freight: sql<number>`COALESCE(${licenseT.freight}, 0)::float`,
      other_costs: sql<number>`COALESCE(${licenseT.otherCosts}, 0)::float`,
      partielle_count: sql<number>`(
        SELECT COUNT(*) FROM bivac_partial_t p
        WHERE p.license_id = ${licenseT.id} AND p.display = 'Y'
      )::int`,
      total_used_weight: sql<number>`${usedWeight}::float`,
      total_used_fob: sql<number>`${usedFob}::float`,
      balance_weight: sql<number>`(COALESCE(${licenseT.weight}, 0) - ${usedWeight})::float`,
      balance_fob: sql<number>`(COALESCE(${licenseT.fobDeclared}, 0) - ${usedFob})::float`,
    })
    .from(licenseT)
    .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
    .leftJoin(currencyMaster, eq(currencyMaster.id, licenseT.currencyId))
    .leftJoin(typeOfGoodsMaster, eq(typeOfGoodsMaster.id, licenseT.typeOfGoodsId))
    .where(licenseWhere(clientId, q))
    .orderBy(desc(licenseT.id))
    .limit(limit)
    .offset(offset);
  return rows as BivacLicenseRow[];
}

// Clients that own at least one import licence — the filter dropdown source.
export async function listBivacClients(): Promise<Array<{ id: number; short_name: string | null }>> {
  return db
    .selectDistinct({ id: clientMaster.id, short_name: clientMaster.shortName })
    .from(clientMaster)
    .innerJoin(licenseT, eq(licenseT.clientId, clientMaster.id))
    .where(and(eq(clientMaster.display, 'Y'), eq(licenseT.display, 'Y'), sql`${licenseT.kindId} IN (1, 2)`))
    .orderBy(clientMaster.shortName);
}

// ---- PARTIELLE rows for a licence, with per-row used + remaining -------------

export interface BivacPartialView {
  id: number;
  partial_name: string;
  partial_weight: number;
  partial_fob: number;
  partial_insurance: number;
  partial_freight: number;
  partial_other_costs: number;
  used_weight: number;
  used_fob: number;
  remaining_weight: number;
  remaining_fob: number;
  import_count: number;
}

// Shared projection: a PARTIELLE row + its used/remaining/import-count derived
// from imports_t. `whereSql` scopes it (by license or by id).
function partialSelect() {
  const usedW = sql<string>`(SELECT COALESCE(SUM(i.weight),0) FROM imports_t i WHERE i.inspection_reports = ${bivacPartial.partialName} AND i.display = 'Y')`;
  const usedF = sql<string>`(SELECT COALESCE(SUM(i.fob),0) FROM imports_t i WHERE i.inspection_reports = ${bivacPartial.partialName} AND i.display = 'Y')`;
  return {
    id: bivacPartial.id,
    partial_name: bivacPartial.partialName,
    partial_weight: sql<number>`${bivacPartial.partialWeight}::float`,
    partial_fob: sql<number>`${bivacPartial.partialFob}::float`,
    partial_insurance: sql<number>`${bivacPartial.partialInsurance}::float`,
    partial_freight: sql<number>`${bivacPartial.partialFreight}::float`,
    partial_other_costs: sql<number>`${bivacPartial.partialOtherCosts}::float`,
    used_weight: sql<number>`${usedW}::float`,
    used_fob: sql<number>`${usedF}::float`,
    remaining_weight: sql<number>`(${bivacPartial.partialWeight} - ${usedW})::float`,
    remaining_fob: sql<number>`(${bivacPartial.partialFob} - ${usedF})::float`,
    import_count: sql<number>`(SELECT COUNT(*) FROM imports_t i WHERE i.inspection_reports = ${bivacPartial.partialName} AND i.display = 'Y')::int`,
  };
}

export async function listPartialsForLicense(licenseId: number): Promise<BivacPartialView[]> {
  const rows = await db
    .select(partialSelect())
    .from(bivacPartial)
    .where(and(eq(bivacPartial.licenseId, licenseId), eq(bivacPartial.display, 'Y')))
    .orderBy(bivacPartial.partialName);
  return rows as BivacPartialView[];
}

export async function getPartialView(id: number): Promise<BivacPartialView | null> {
  const [row] = await db
    .select(partialSelect())
    .from(bivacPartial)
    .where(and(eq(bivacPartial.id, id), eq(bivacPartial.display, 'Y')))
    .limit(1);
  return (row as BivacPartialView) ?? null;
}

// ---- Capacity check (§ update validation) ------------------------------------

export interface LicenseCapacity {
  license_id: number;
  weight: number;
  fob: number;
  insurance: number;
  freight: number;
  other_costs: number;
}

// The licence's own totals plus what every OTHER active PARTIELLE already
// allocates — used to reject an update that would over-allocate the licence.
export async function getAllocationContext(
  licenseId: number,
  excludePartialId: number,
): Promise<{ capacity: LicenseCapacity; allocatedByOthers: Omit<LicenseCapacity, 'license_id'> } | null> {
  const [lic] = await db
    .select({
      weight: sql<number>`COALESCE(${licenseT.weight},0)::float`,
      fob: sql<number>`COALESCE(${licenseT.fobDeclared},0)::float`,
      insurance: sql<number>`COALESCE(${licenseT.insurance},0)::float`,
      freight: sql<number>`COALESCE(${licenseT.freight},0)::float`,
      other_costs: sql<number>`COALESCE(${licenseT.otherCosts},0)::float`,
    })
    .from(licenseT)
    .where(and(eq(licenseT.id, licenseId), eq(licenseT.display, 'Y')))
    .limit(1);
  if (!lic) return null;

  const [alloc] = await db
    .select({
      weight: sql<number>`COALESCE(SUM(${bivacPartial.partialWeight}),0)::float`,
      fob: sql<number>`COALESCE(SUM(${bivacPartial.partialFob}),0)::float`,
      insurance: sql<number>`COALESCE(SUM(${bivacPartial.partialInsurance}),0)::float`,
      freight: sql<number>`COALESCE(SUM(${bivacPartial.partialFreight}),0)::float`,
      other_costs: sql<number>`COALESCE(SUM(${bivacPartial.partialOtherCosts}),0)::float`,
    })
    .from(bivacPartial)
    .where(
      and(
        eq(bivacPartial.licenseId, licenseId),
        ne(bivacPartial.id, excludePartialId),
        eq(bivacPartial.display, 'Y'),
      ),
    );

  return {
    capacity: { license_id: licenseId, ...lic },
    allocatedByOthers: alloc ?? { weight: 0, fob: 0, insurance: 0, freight: 0, other_costs: 0 },
  };
}
