import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT, importT, licenseT, transitPointMaster } from '@/db/schema';
import type { MetricDef, MonthPoint } from '@/lib/comparison';
import type { ComparisonModule, SliceFilter } from '@/db/queries/comparisonEngine';
import { licenseUseForCondition, type LicenseUseFor } from '@/db/queries/licenseFilters';
import { fileNotCancelled } from '@/db/queries/fileCancellation';

// §4.29 — what the Licence comparison measures for one slice. The engine
// (comparisonEngine.ts) decides WHICH slices; this says what a slice's figures
// are. Every rule below is borrowed from the licence dashboard rather than
// restated, so the comparison and the dashboard cannot disagree (§4.10):
//
//  * A licence is dated by `license_applied_date` — the business date the
//    dashboard's period cards and monthly trend count on (licenseDashboardTabs).
//  * Import / export is the KIND's flag (licenseUseForCondition). A kind flagged
//    for both (IMPORT TEMPORARY) counts on both sides, and a licence with no kind
//    on neither — so the two direction slices need not add up to the whole.
//  * Expired is DERIVED, never stored: an ACTIVE licence whose expiry date has
//    passed (licenseFilters.IS_EXPIRED). Here it is judged at the window's end
//    instead of today, which is the same rule moved to another day.
//  * Soft-deleted licences are out of every figure (§4.27).

function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

const applied = sql`${licenseT.licenseAppliedDate}`;
const expiry = sql`${licenseT.licenseExpiryDate}`;
const isActive = sql`${licenseT.status} = 'ACTIVE'`;

const isUseFor = (v: string): v is LicenseUseFor => v === 'import' || v === 'export';

/** Everything a slice narrows by except the dates. */
function scopeOf(f: SliceFilter): SQL {
  const parts: SQL[] = [sql`${licenseT.display} = 'Y'`];
  if (f.clientId !== undefined) parts.push(sql`${licenseT.clientId} = ${f.clientId}`);
  if (f.direction !== undefined) {
    // A direction this module does not offer matches nothing rather than everything.
    parts.push(isUseFor(f.direction) ? licenseUseForCondition(f.direction) : sql`FALSE`);
  }
  if (f.officeId !== undefined) parts.push(sql`${licenseT.entryPostId} = ${f.officeId}`);
  return sql.join(parts, sql` AND `);
}

/** Applied inside the window — the licences a slice "raised". */
const inWindow = (f: SliceFilter): SQL => sql`${applied} BETWEEN ${f.from}::date AND ${f.to}::date`;

/**
 * The day the end-of-window stock is read on. A window that runs into the
 * future is read as of today: "active at the end of December" is not knowable
 * in October, and projecting it would count licences that may yet be annulled.
 */
const asOf = (f: SliceFilter): SQL => sql`LEAST(${f.to}::date, current_date)`;

const METRICS: MetricDef[] = [
  {
    key: 'raised',
    label: 'Licences raised',
    format: 'count',
    better: 'neutral',
    hint: 'Licences whose applied date falls in the window — the date the licence dashboard counts on.',
  },
  {
    key: 'weight',
    label: 'Licensed weight',
    format: 'kg',
    better: 'neutral',
    hint: 'Weight declared on the licences raised, summed as entered (the licence form defaults to kg).',
  },
  {
    key: 'fob_usd',
    label: 'FOB declared (USD)',
    format: 'usd',
    better: 'neutral',
    hint: 'FOB declared on the licences raised, USD-denominated licences only — other currencies are left out, not converted.',
  },
  {
    key: 'validated',
    label: 'Validated in window',
    format: 'count',
    better: 'up',
    hint: 'Licences whose validation date falls in the window, whenever they were applied for.',
  },
  {
    key: 'expiring',
    label: 'Expiring in window',
    format: 'count',
    better: 'down',
    hint: 'ACTIVE licences whose expiry date falls in the window.',
  },
  {
    key: 'expired',
    label: 'Expired by window end',
    format: 'count',
    better: 'down',
    hint: 'ACTIVE licences already past their expiry date at the end of the window (or today, if sooner).',
  },
  {
    key: 'active',
    label: 'Active at window end',
    format: 'count',
    better: 'up',
    hint: 'ACTIVE licences applied by the end of the window and still in date then (status is the current one).',
  },
  {
    key: 'avg_validation_days',
    label: 'Avg days applied → validated',
    format: 'days',
    better: 'down',
    hint: 'Mean days from applied to validated, over the licences raised that carry both dates.',
  },
  {
    key: 'files',
    label: 'Files raised on these licences',
    format: 'count',
    better: 'up',
    hint: 'Import and export files (not cancelled) referencing a licence raised in the window.',
  },
  {
    key: 'utilisation',
    label: 'Weight utilisation',
    format: 'pct',
    better: 'up',
    hint: 'Weight on those files ÷ licensed weight, over licences raised that declare a weight above zero.',
  },
];

const EMPTY: Record<string, number | null> = Object.fromEntries(METRICS.map((m) => [m.key, null]));

interface MeasureRow {
  raised: number;
  weight: number | null;
  fob_usd: number | null;
  validated: number;
  expiring: number;
  expired: number;
  active: number;
  avg_validation_days: number | null;
  files: number;
  used_weight: number | null;
  capped_weight: number | null;
}

async function measure(f: SliceFilter): Promise<Record<string, number | null>> {
  const scope = scopeOf(f);
  const end = asOf(f);
  const [r] = rowsOf<MeasureRow>(
    await db.execute(sql`
      WITH cohort AS (
        SELECT ${licenseT.id} AS id,
               ${licenseT.weight} AS weight,
               ${licenseT.fobDeclared} AS fob,
               ${licenseT.fobCurrencyId} AS fob_currency_id,
               ${licenseT.licenseAppliedDate} AS applied_date,
               ${licenseT.licenseValidationDate} AS validation_date
          FROM ${licenseT}
         WHERE ${scope} AND ${inWindow(f)}
      ),
      file_weight AS (
        SELECT license_id, SUM(weight) AS w, count(*) AS n FROM (
          SELECT ${importT.licenseId} AS license_id, ${importT.weight} AS weight
            FROM ${importT}
           WHERE ${importT.display} = 'Y' AND ${fileNotCancelled(importT.clearingStatus)}
             AND ${importT.licenseId} IN (SELECT id FROM cohort)
          UNION ALL
          SELECT ${exportT.licenseId}, ${exportT.weight}
            FROM ${exportT}
           WHERE ${exportT.display} = 'Y' AND ${fileNotCancelled(exportT.clearingStatus)}
             AND ${exportT.licenseId} IN (SELECT id FROM cohort)
        ) files
         GROUP BY license_id
      )
      SELECT
        (SELECT count(*) FROM cohort)::int AS raised,
        (SELECT SUM(weight) FROM cohort)::float AS weight,
        (SELECT SUM(c.fob) FROM cohort c
           JOIN currency_master_t cu ON cu.id = c.fob_currency_id
          WHERE upper(trim(cu.currency_short_name)) = 'USD')::float AS fob_usd,
        (SELECT round(AVG(validation_date - applied_date)::numeric, 1) FROM cohort
          WHERE validation_date IS NOT NULL AND applied_date IS NOT NULL
            AND validation_date >= applied_date)::float AS avg_validation_days,
        (SELECT COALESCE(SUM(n), 0) FROM file_weight)::int AS files,
        (SELECT SUM(COALESCE(fw.w, 0)) FROM cohort c LEFT JOIN file_weight fw ON fw.license_id = c.id
          WHERE c.weight > 0)::float AS used_weight,
        (SELECT SUM(weight) FROM cohort WHERE weight > 0)::float AS capped_weight,
        (SELECT count(*) FROM ${licenseT}
          WHERE ${scope}
            AND ${licenseT.licenseValidationDate} BETWEEN ${f.from}::date AND ${f.to}::date)::int AS validated,
        (SELECT count(*) FROM ${licenseT}
          WHERE ${scope} AND ${isActive}
            AND ${expiry} BETWEEN ${f.from}::date AND ${f.to}::date)::int AS expiring,
        (SELECT count(*) FROM ${licenseT}
          WHERE ${scope} AND ${isActive}
            AND ${expiry} IS NOT NULL AND ${expiry} < ${end})::int AS expired,
        (SELECT count(*) FROM ${licenseT}
          WHERE ${scope} AND ${isActive} AND ${applied} <= ${end}
            AND (${expiry} IS NULL OR ${expiry} >= ${end}))::int AS active`),
  );
  if (!r) return EMPTY;
  return {
    raised: r.raised,
    weight: r.weight ?? (r.raised > 0 ? 0 : null),
    fob_usd: r.fob_usd ?? (r.raised > 0 ? 0 : null),
    validated: r.validated,
    expiring: r.expiring,
    expired: r.expired,
    active: r.active,
    avg_validation_days: r.avg_validation_days,
    files: r.files,
    // No capped licence → no ratio. 0% would claim the licences were untouched.
    utilisation: r.capped_weight ? Math.round(((r.used_weight ?? 0) / r.capped_weight) * 1000) / 10 : null,
  };
}

async function monthly(f: SliceFilter): Promise<MonthPoint[]> {
  const scope = scopeOf(f);
  // Every month in the window, quiet ones included — a gap in a trend is
  // information (as the licence dashboard's own trend does).
  return rowsOf<MonthPoint>(
    await db.execute(sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', ${f.from}::date),
          date_trunc('month', ${f.to}::date),
          interval '1 month'
        ) AS m
      )
      SELECT to_char(months.m, 'YYYY-MM') AS month,
             (SELECT count(*) FROM ${licenseT}
               WHERE ${scope} AND ${inWindow(f)}
                 AND date_trunc('month', ${applied}) = months.m)::int AS value
        FROM months
       ORDER BY months.m`),
  );
}

async function topBy(column: SQL, from: string, to: string, n: number): Promise<number[]> {
  const window: SliceFilter = { from, to };
  return rowsOf<{ id: number }>(
    await db.execute(sql`
      SELECT ${column} AS id
        FROM ${licenseT}
       WHERE ${scopeOf(window)} AND ${inWindow(window)} AND ${column} IS NOT NULL
       GROUP BY ${column}
       ORDER BY count(*) DESC, ${column}
       LIMIT ${n}`),
  ).map((r) => r.id);
}

export const licensesComparison: ComparisonModule = {
  metrics: METRICS,
  headline: 'raised',
  officeLabel: 'Entry / Exit Post',
  directions: [
    { key: 'import', label: 'Import' },
    { key: 'export', label: 'Export' },
  ],
  async offices() {
    // The posts a licence can name: live transit points that serve as an entry
    // or an exit, by their own flags (§4.1).
    return rowsOf<{ id: number; label: string }>(
      await db.execute(sql`
        SELECT ${transitPointMaster.id} AS id, ${transitPointMaster.transitPointName} AS label
          FROM ${transitPointMaster}
         WHERE ${transitPointMaster.display} = 'Y'
           AND (${transitPointMaster.entryPoint} OR ${transitPointMaster.exitPoint})
         ORDER BY ${transitPointMaster.id}`),
    );
  },
  measure,
  monthly,
  topClients: (from, to, n) => topBy(sql`${licenseT.clientId}`, from, to, n),
  topOffices: (from, to, n) => topBy(sql`${licenseT.entryPostId}`, from, to, n),
};
