import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { licenseT, clientMaster, kindMaster, banklistMaster } from '@/db/schema';
import {
  EXPIRING_WINDOW_DAYS,
  IS_EXPIRED,
  IS_EXPIRING,
  IS_LIVE,
  licenseUseForCondition,
  type LicenseUseFor,
} from './licenseFilters';

// §4.29 — the Licence dashboard's data, computed in SQL over live rows.
//
// Every figure here is an aggregate the database evaluates, never a count taken
// from a page of results: the list screen pages at 25, so anything derived
// client-side would report "25 licences" on a file of four hundred.
//
// What a licence dashboard is FOR, per §4.29, is expiry and the import/export
// split — so that is what it answers, in the order an operator needs it:
// what lapses next, how the book divides, and whether the volume is moving.

export interface LicenseKpi {
  total: number;
  active: number;
  expiring: number;
  expired: number;
  annulated: number;
  modified: number;
  prorogated: number;
  inactive: number;
}

export interface ExpiryBucket {
  label: string;
  days: number;
  count: number;
}

export interface LicenseDashboard {
  kpi: LicenseKpi;
  /** How much of the book lapses inside each horizon — cumulative, not disjoint. */
  expiry_outlook: ExpiryBucket[];
  /** Which side of the business the licence serves, from the kind's own flags. */
  use_split: { import: number; export: number; unclassified: number };
  /** Applications per month over the last year, for the trend. */
  monthly: Array<{ month: string; month_name: string; applied: number }>;
  /** The actionable list: what lapses next, soonest first. */
  expiring_soon: Array<{
    id: number;
    license_number: string | null;
    client_name: string | null;
    bank_name: string | null;
    license_expiry_date: string | null;
    days_left: number;
  }>;
  top_clients: Array<{ client_name: string | null; total: number; active: number }>;
  by_kind: Array<{ kind_name: string | null; total: number }>;
}

/** Every licence that has not been soft-deleted (§4.27). */
const NOT_DELETED = eq(licenseT.display, 'Y');

/**
 * The base every figure on this dashboard is counted over.
 *
 * `useFor` narrows it to one side of the business, so the Import and Export
 * Licence dashboards are the same aggregates over a different book rather than
 * two implementations that will drift (§4.10). Omitted, it reports on both —
 * which is what the combined dashboard did before either was scoped.
 */
function scopeOf(useFor?: LicenseUseFor): SQL {
  return (useFor ? and(NOT_DELETED, licenseUseForCondition(useFor)) : NOT_DELETED) as SQL;
}

async function countWhere(base: SQL, cond?: ReturnType<typeof sql> | undefined): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(licenseT)
    .where(cond ? and(base, cond) : base);
  return row?.n ?? 0;
}

export async function getLicenseDashboard(useFor?: LicenseUseFor): Promise<LicenseDashboard> {
  const LIVE = scopeOf(useFor);
  // The twelve-month trend is raw SQL over an aliased table, so it cannot reuse
  // the Drizzle condition above — it restates the same narrowing by hand.
  const monthlyScope = useFor
    ? sql` AND l.kind_id IN (SELECT id FROM kind_master_t WHERE ${sql.identifier(
        useFor === 'import' ? 'use_for_import' : 'use_for_export',
      )} IS TRUE)`
    : sql``;
  // One pass for the KPI row rather than eight round trips. FILTER is the
  // Postgres spelling of a conditional aggregate and keeps each bucket readable
  // beside the predicate it counts.
  const [kpiRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) FILTER (WHERE ${IS_LIVE})::int`,
      expiring: sql<number>`count(*) FILTER (WHERE ${IS_EXPIRING})::int`,
      expired: sql<number>`count(*) FILTER (WHERE ${IS_EXPIRED})::int`,
      annulated: sql<number>`count(*) FILTER (WHERE ${licenseT.status} = 'ANNULATED')::int`,
      modified: sql<number>`count(*) FILTER (WHERE ${licenseT.status} = 'MODIFIED')::int`,
      prorogated: sql<number>`count(*) FILTER (WHERE ${licenseT.status} = 'PROROGATED')::int`,
      inactive: sql<number>`count(*) FILTER (WHERE ${licenseT.status} = 'INACTIVE')::int`,
    })
    .from(licenseT)
    .where(LIVE);

  // Cumulative horizons: "within 30 days" includes the ones due this week. A
  // disjoint banding reads as four separate problems when it is one problem
  // getting closer, and an operator asking "what must I renew this quarter"
  // wants the running total.
  const horizons = [7, 30, 60, 90];
  const outlook = await Promise.all(
    horizons.map(async (days) => ({
      label: `Next ${days} days`,
      days,
      count: await countWhere(LIVE, sql`(
        ${licenseT.status} = 'ACTIVE'
        AND ${licenseT.licenseExpiryDate} IS NOT NULL
        AND ${licenseT.licenseExpiryDate} BETWEEN current_date
            AND current_date + (${days} || ' days')::interval
      )`),
    })),
  );

  // Import vs export comes from the KIND's flags, never an id list, so
  // re-flagging a kind is a master edit rather than a deploy (§4.1). A licence
  // with no kind is counted separately rather than silently dropped — it is a
  // data gap somebody should close, and hiding it would hide the gap.
  const [splitRow] = await db
    .select({
      imports: sql<number>`count(*) FILTER (WHERE ${kindMaster.useForImport} IS TRUE)::int`,
      exports: sql<number>`count(*) FILTER (WHERE ${kindMaster.useForExport} IS TRUE)::int`,
      unclassified: sql<number>`count(*) FILTER (WHERE ${licenseT.kindId} IS NULL)::int`,
    })
    .from(licenseT)
    .leftJoin(kindMaster, eq(kindMaster.id, licenseT.kindId))
    .where(LIVE);

  // Twelve months INCLUDING the empty ones: a gap in a trend is information, and
  // a chart that silently omits a quiet month draws a straight line through it.
  const monthly = await db.execute(sql`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', current_date) - interval '11 months',
        date_trunc('month', current_date),
        interval '1 month'
      ) AS m
    )
    SELECT to_char(months.m, 'YYYY-MM') AS month,
           to_char(months.m, 'Mon YYYY') AS month_name,
           count(l.id)::int AS applied
      FROM months
      LEFT JOIN ${licenseT} l
        ON l.display = 'Y'
       AND l.license_applied_date IS NOT NULL
       AND date_trunc('month', l.license_applied_date) = months.m${monthlyScope}
     GROUP BY months.m
     ORDER BY months.m`);

  const expiringSoon = await db
    .select({
      id: licenseT.id,
      license_number: licenseT.licenseNumber,
      // §4.15 — the client is a column on someone else's row here, so the code.
      client_name: clientMaster.shortName,
      bank_name: banklistMaster.bankName,
      license_expiry_date: licenseT.licenseExpiryDate,
      days_left: sql<number>`(${licenseT.licenseExpiryDate} - current_date)::int`,
    })
    .from(licenseT)
    .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
    .leftJoin(banklistMaster, eq(banklistMaster.id, licenseT.bankId))
    .where(and(LIVE, IS_EXPIRING))
    .orderBy(licenseT.licenseExpiryDate)
    .limit(10);

  const topClients = await db
    .select({
      client_name: clientMaster.shortName,
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) FILTER (WHERE ${IS_LIVE})::int`,
    })
    .from(licenseT)
    .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
    .where(LIVE)
    .groupBy(clientMaster.shortName)
    .orderBy(sql`count(*) DESC`)
    .limit(8);

  const byKind = await db
    .select({
      kind_name: kindMaster.kindName,
      total: sql<number>`count(*)::int`,
    })
    .from(licenseT)
    .leftJoin(kindMaster, eq(kindMaster.id, licenseT.kindId))
    .where(LIVE)
    .groupBy(kindMaster.kindName)
    .orderBy(sql`count(*) DESC`)
    .limit(8);

  return {
    kpi: {
      total: kpiRow?.total ?? 0,
      active: kpiRow?.active ?? 0,
      expiring: kpiRow?.expiring ?? 0,
      expired: kpiRow?.expired ?? 0,
      annulated: kpiRow?.annulated ?? 0,
      modified: kpiRow?.modified ?? 0,
      prorogated: kpiRow?.prorogated ?? 0,
      inactive: kpiRow?.inactive ?? 0,
    },
    expiry_outlook: outlook,
    use_split: {
      import: splitRow?.imports ?? 0,
      export: splitRow?.exports ?? 0,
      unclassified: splitRow?.unclassified ?? 0,
    },
    monthly: (monthly as unknown as {
      rows: Array<{ month: string; month_name: string; applied: number }>;
    }).rows,
    expiring_soon: expiringSoon.map((r) => ({
      ...r,
      days_left: Number(r.days_left ?? 0),
    })),
    top_clients: topClients,
    by_kind: byKind,
  };
}

/** Exported so the page and the API agree on the renewal window's name. */
export const RENEWAL_WINDOW_DAYS = EXPIRING_WINDOW_DAYS;
