// Bivac / PARTIELLE management queries (§7.4) — the licence-level view over the
// SAME allotments Import Tracking creates (partial_t, see partielle.ts). Nothing
// here is stored: the "used" and "balance" figures are derived, so they can
// never drift from the licences and files they summarise.
//   • licence capacity  → license_t columns
//   • used              → SUM of the import AND export files whose
//                         inspection_reports names one of the licence's
//                         allotments, cancelled files excluded — the same rule
//                         listForLicense applies per allotment
//   • balance           → capacity − used
import { and, eq, or, ilike, sql, count, desc, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fileNotCancelled } from '@/db/queries/fileCancellation';
import { licenseT, clientMaster, currencyMaster, typeOfGoodsMaster, partialT } from '@/db/schema';

/** §4.7 — the menu URL every Bivac route checks permissions against (0170). */
export const BIVAC_RESOURCE = '/bivac';

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
  total_allocated_weight: number;
  total_allocated_fob: number;
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
    // §4.15 — the column shows the code; an outside document carries the name.
    ilike(clientMaster.shortName, qLike),
    ilike(clientMaster.companyName, qLike),
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

/** Live (not deleted, not cancelled) import and export files, as one set. */
const CONSIGNMENTS = sql`(
  SELECT inspection_reports, weight, fob FROM imports_t
   WHERE display = 'Y' AND inspection_reports IS NOT NULL AND ${fileNotCancelled(sql`imports_t.clearing_status`)}
  UNION ALL
  SELECT inspection_reports, weight, fob FROM exports_t
   WHERE display = 'Y' AND inspection_reports IS NOT NULL AND ${fileNotCancelled(sql`exports_t.clearing_status`)}
)`;

/** What the files on the licence row's allotments have consumed. */
function usedSum(col: 'weight' | 'fob'): SQL<string> {
  return sql<string>`(
    SELECT COALESCE(SUM(c.${sql.raw(col)}), 0)
    FROM ${CONSIGNMENTS} c
    INNER JOIN partial_t p ON p.partial_name = c.inspection_reports
    WHERE p.license_id = ${licenseT.id} AND p.display = 'Y'
  )`;
}

/** What the licence row's allotments have been given between them. */
function allocatedSum(col: 'partial_weight' | 'partial_fob'): SQL<string> {
  return sql<string>`(
    SELECT COALESCE(SUM(p.${sql.raw(col)}), 0) FROM partial_t p
    WHERE p.license_id = ${licenseT.id} AND p.display = 'Y'
  )`;
}

/**
 * One page of the list, or, with no `page`, every matching licence. The Excel
 * export asks for the latter so the file holds every row the grid's filter
 * matched, not just one page (§4.15).
 */
export async function listBivacLicenses(
  clientId: number | undefined,
  q: string | undefined,
  page?: { limit: number; offset: number },
): Promise<BivacLicenseRow[]> {
  const usedWeight = usedSum('weight');
  const usedFob = usedSum('fob');
  const query = db
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
        SELECT COUNT(*) FROM partial_t p
        WHERE p.license_id = ${licenseT.id} AND p.display = 'Y'
      )::int`,
      total_allocated_weight: sql<number>`${allocatedSum('partial_weight')}::float`,
      total_allocated_fob: sql<number>`${allocatedSum('partial_fob')}::float`,
      total_used_weight: sql<number>`${usedWeight}::float`,
      total_used_fob: sql<number>`${usedFob}::float`,
    })
    .from(licenseT)
    .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
    .leftJoin(currencyMaster, eq(currencyMaster.id, licenseT.currencyId))
    .leftJoin(typeOfGoodsMaster, eq(typeOfGoodsMaster.id, licenseT.typeOfGoodsId))
    .where(licenseWhere(clientId, q))
    .orderBy(desc(licenseT.id))
    .$dynamic();
  const rows = page ? await query.limit(page.limit).offset(page.offset) : await query;
  // Balance here rather than in SQL: Postgres re-runs a correlated subquery
  // each time it is written, so `weight - (usage scan)` would scan the files a
  // second time per row for a figure already selected.
  return rows.map((r) => ({
    ...r,
    balance_weight: round3(r.weight - r.total_used_weight),
    balance_fob: round3(r.fob_declared - r.total_used_fob),
  }));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Clients that own at least one import licence — the filter dropdown source.
export async function listBivacClients(): Promise<Array<{ id: number; short_name: string | null }>> {
  return db
    .selectDistinct({ id: clientMaster.id, short_name: clientMaster.shortName })
    .from(clientMaster)
    .innerJoin(licenseT, eq(licenseT.clientId, clientMaster.id))
    .where(and(eq(clientMaster.display, 'Y'), eq(licenseT.display, 'Y'), sql`${licenseT.kindId} IN (1, 2)`))
    .orderBy(clientMaster.id);
}

// ---- Licence header (the PARTIELLE export's repeated licence columns) --------

export interface BivacLicenseHeader {
  id: number;
  license_number: string | null;
  ref_cod: string | null;
  /** The legal name — this feeds export cells, which leave the office (§4.15). */
  client_company_name: string | null;
  weight: number;
  fob_declared: number;
}

export async function getBivacLicenseHeader(licenseId: number): Promise<BivacLicenseHeader | null> {
  const [row] = await db
    .select({
      id: licenseT.id,
      license_number: licenseT.licenseNumber,
      ref_cod: licenseT.refCod,
      client_company_name: clientMaster.companyName,
      weight: sql<number>`COALESCE(${licenseT.weight}, 0)::float`,
      fob_declared: sql<number>`COALESCE(${licenseT.fobDeclared}, 0)::float`,
    })
    .from(licenseT)
    .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
    .where(and(eq(licenseT.id, licenseId), eq(licenseT.display, 'Y')))
    .limit(1);
  return row ?? null;
}

// ---- The files drawing on one allotment ---------------------------------------

export async function getActivePartialName(id: number): Promise<string | null> {
  const [row] = await db
    .select({ name: partialT.partialName })
    .from(partialT)
    .where(and(eq(partialT.id, id), eq(partialT.display, 'Y')))
    .limit(1);
  return row?.name ?? null;
}

export interface BivacFileRow {
  /** Unique across both tables — an import and an export can share an id. */
  key: string;
  side: 'Import' | 'Export';
  mca_ref: string | null;
  inspection_reports: string | null;
  declaration_reference: string | null;
  dgda_in_date: string | null;
  liquidation_reference: string | null;
  liquidation_date: string | null;
  quittance_reference: string | null;
  quittance_date: string | null;
  weight: number;
  fob: number;
}

/**
 * The import and export files consuming an allotment — linked by
 * `inspection_reports = partial_name`, cancelled files excluded. The same set
 * listForLicense counts as the allotment's files and usage, so the list a
 * badge opens always has the number of rows the badge showed.
 */
export async function listFilesForPartial(partialName: string): Promise<BivacFileRow[]> {
  const cols = sql`mca_ref, inspection_reports, declaration_reference,
    to_char(dgda_in_date, 'YYYY-MM-DD') AS dgda_in_date, liquidation_reference,
    to_char(liquidation_date, 'YYYY-MM-DD') AS liquidation_date, quittance_reference,
    to_char(quittance_date, 'YYYY-MM-DD') AS quittance_date,
    COALESCE(weight, 0)::float AS weight, COALESCE(fob, 0)::float AS fob`;
  const result = await db.execute(sql`
    SELECT 'import-' || id AS key, 'Import' AS side, ${cols}, id FROM imports_t
     WHERE inspection_reports = ${partialName} AND display = 'Y'
       AND ${fileNotCancelled(sql`imports_t.clearing_status`)}
    UNION ALL
    SELECT 'export-' || id AS key, 'Export' AS side, ${cols}, id FROM exports_t
     WHERE inspection_reports = ${partialName} AND display = 'Y'
       AND ${fileNotCancelled(sql`exports_t.clearing_status`)}
    ORDER BY side DESC, id ASC`);
  return (result as unknown as { rows: BivacFileRow[] }).rows;
}
