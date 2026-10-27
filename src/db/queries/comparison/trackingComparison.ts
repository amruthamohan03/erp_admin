import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT, importT, mainOfficeMaster } from '@/db/schema';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { MetricDef, MonthPoint } from '@/lib/comparison';
import type { ComparisonModule, SliceFilter } from '../comparisonEngine';
import { CLEARING_STATUS, clearingStatusIn, clearingStatusIs } from '../clearingStatus';

// §4.29 — what the Tracking Comparison dashboard measures for one slice.
//
// Import Tracking (`imports_t`) and Export Tracking (`exports_t`) are read as
// ONE normalised row each (`base`), so every metric is written once and means
// the same thing for both directions (§4.10) — the `invoiceDashboardTabs.ts`
// pattern. With no direction the two are combined, which is why the direction
// slices of an additive metric always sum to the combined figure.
//
// The rules are the tracking dashboards', not new ones:
//
//  * A file belongs to the window it was OPENED in — `created_at`, the basis of
//    the Import/Export dashboards' "how much work came in" panels.
//  * Clearing statuses are matched by master TEXT through `clearingStatus.ts`.
//    "Cleared" is the finished set the Import briefing uses: CLEARING COMPLETED,
//    CLEARED WITH IR and CLEARED WITH ARA — a file cleared with an IR is done.
//  * Clearance time is DGDA In → DGDA Out, the span both dashboards report as
//    customs / declaration-office time, over files that carry both dates.
//  * Soft-deleted files are out of every figure (§4.27).
//
// What is deliberately NOT measured:
//
//  * A delay / within-target metric. Delay is owned by /imkpi and /exkpi in
//    WORKING days against per-stage targets (see `src/lib/tracking/ageing.ts`);
//    a calendar-day "% within N days" here would be a second definition.
//  * Liquidation amount. It is CDF, and a comparison has no CDF format — summing
//    it into a USD-formatted cell would misstate it.

function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

const DONE_SET = [CLEARING_STATUS.completed, CLEARING_STATUS.clearedWithIr, CLEARING_STATUS.clearedWithAra];

/**
 * One direction's normalised columns.
 *
 * OFFICE — the one office concept both tables share is the CLIENT's office
 * (`client_master_t.office_location_id` → `main_office_master_t`, shown as
 * "Location" on the client form). The declaration desk (`declaration_office_id`
 * → `sub_office_master_t`) exists on imports only; exports carry a loading site
 * and an exit point, which are transit points, not offices. Comparing offices
 * by the desk would leave every export file out of every office slice, so the
 * office here is the regional office that handles the client's files.
 *
 * WEIGHT — imports record KG, exports record MT (the export list's "Weight (MT)"
 * column), so exports are multiplied by 1000 before anything is added.
 *
 * FOB — only files whose currency is USD are summed; any other currency is left
 * out rather than added at face value. Imports state the FOB's own currency
 * (`fob_currency`), falling back to the file currency; exports have one.
 */
interface Side {
  key: 'import' | 'export';
  table: typeof importT | typeof exportT;
  clientId: AnyPgColumn;
  createdAt: AnyPgColumn;
  clearingStatus: AnyPgColumn;
  display: AnyPgColumn;
  weightKg: SQL;
  fobCurrency: SQL;
  fob: AnyPgColumn;
  dgdaIn: AnyPgColumn;
  dgdaOut: AnyPgColumn;
}

const SIDES: Side[] = [
  {
    key: 'import',
    table: importT,
    clientId: importT.clientId,
    createdAt: importT.createdAt,
    clearingStatus: importT.clearingStatus,
    display: importT.display,
    weightKg: sql`${importT.weight}`,
    fobCurrency: sql`COALESCE(${importT.fobCurrency}, ${importT.currency})`,
    fob: importT.fob,
    dgdaIn: importT.dgdaInDate,
    dgdaOut: importT.dgdaOutDate,
  },
  {
    key: 'export',
    table: exportT,
    clientId: exportT.clientId,
    createdAt: exportT.createdAt,
    clearingStatus: exportT.clearingStatus,
    display: exportT.display,
    weightKg: sql`(${exportT.weight} * 1000)`,
    fobCurrency: sql`${exportT.currency}`,
    fob: exportT.fob,
    dgdaIn: exportT.dgdaInDate,
    dgdaOut: exportT.dgdaOutDate,
  },
];

/** One direction's rows inside the slice, every filter pushed into the branch. */
function branch(s: Side, f: SliceFilter, matchNone = false): SQL {
  const where: SQL[] = [
    matchNone ? sql`false` : sql`${s.display} = 'Y'`,
    sql`${s.createdAt}::date >= ${f.from}::date`,
    sql`${s.createdAt}::date <= ${f.to}::date`,
  ];
  if (f.clientId !== undefined) where.push(sql`${s.clientId} = ${f.clientId}`);
  if (f.officeId !== undefined) where.push(sql`c.office_location_id = ${f.officeId}`);
  // COALESCE: a NULL clearing status is "neither" — without it the NOT in the
  // open count would be NULL too and the file would vanish from every count.
  return sql`
    SELECT ${s.clientId} AS client_id,
           c.office_location_id AS office_id,
           ${s.createdAt}::date AS opened,
           COALESCE(${clearingStatusIn(s.clearingStatus, DONE_SET)}, false) AS done,
           COALESCE(${clearingStatusIs(s.clearingStatus, CLEARING_STATUS.cancelled)}, false) AS cancelled,
           ${s.weightKg} AS weight_kg,
           CASE WHEN upper(trim(cur.currency_short_name)) = 'USD' THEN ${s.fob} END AS fob_usd,
           (${s.dgdaOut} - ${s.dgdaIn}) AS clearance_days
      FROM ${s.table}
      LEFT JOIN client_master_t c ON c.id = ${s.clientId}
      LEFT JOIN currency_master_t cur ON cur.id = ${s.fobCurrency}
     WHERE ${sql.join(where, sql` AND `)}`;
}

/** The slice's normalised files, as a CTE named `f`. */
function base(f: SliceFilter): SQL {
  const sides = f.direction === undefined ? SIDES : SIDES.filter((s) => s.key === f.direction);
  // An unknown direction key matches nothing rather than everything.
  const parts = sides.length > 0 ? sides.map((s) => branch(s, f)) : SIDES.slice(0, 1).map((s) => branch(s, f, true));
  return sql`WITH f AS (${sql.join(parts, sql` UNION ALL `)})`;
}

const METRICS: MetricDef[] = [
  { key: 'files', label: 'Files opened', format: 'count', better: 'up', hint: 'Import and export files created in the range' },
  {
    key: 'cleared',
    label: 'Cleared',
    format: 'count',
    better: 'up',
    hint: 'Of those, now Clearing Completed, Cleared with IR or Cleared with ARA',
  },
  { key: 'cleared_pct', label: 'Clearance rate', format: 'pct', better: 'up', hint: 'Cleared as a share of files opened' },
  { key: 'cancelled', label: 'Cancelled', format: 'count', better: 'down', hint: 'Of those, now Cancelled' },
  {
    key: 'open',
    label: 'Still open',
    format: 'count',
    better: 'neutral',
    hint: 'Of those, neither cleared nor cancelled today',
  },
  { key: 'weight', label: 'Weight', format: 'kg', better: 'up', hint: 'Import KG plus export MT converted to KG' },
  { key: 'fob', label: 'FOB (USD)', format: 'usd', better: 'up', hint: 'Files whose FOB currency is USD; other currencies left out' },
  {
    key: 'avg_clearance_days',
    label: 'Avg clearance time',
    format: 'days',
    better: 'down',
    hint: 'Calendar days DGDA In → DGDA Out, files with both dates',
  },
];

async function measure(f: SliceFilter): Promise<Record<string, number | null>> {
  const [r] = rowsOf<{
    files: number;
    cleared: number;
    cancelled: number;
    open_files: number;
    weight: number;
    fob: number;
    avg_days: number | null;
  }>(
    await db.execute(sql`
      ${base(f)}
      SELECT count(*)::int AS files,
             count(*) FILTER (WHERE done)::int AS cleared,
             count(*) FILTER (WHERE cancelled)::int AS cancelled,
             count(*) FILTER (WHERE NOT done AND NOT cancelled)::int AS open_files,
             COALESCE(SUM(weight_kg), 0)::float AS weight,
             COALESCE(SUM(fob_usd), 0)::float AS fob,
             AVG(clearance_days)::float AS avg_days
        FROM f`),
  );
  const files = r?.files ?? 0;
  const cleared = r?.cleared ?? 0;
  return {
    files,
    cleared,
    cleared_pct: files === 0 ? null : (cleared * 100) / files,
    cancelled: r?.cancelled ?? 0,
    open: r?.open_files ?? 0,
    weight: r?.weight ?? 0,
    fob: r?.fob ?? 0,
    avg_clearance_days: r?.avg_days === null || r?.avg_days === undefined ? null : Math.round(r.avg_days * 10) / 10,
  };
}

async function monthly(f: SliceFilter): Promise<MonthPoint[]> {
  // A generated series, so a quiet month is a zero in the chart rather than
  // two busy months drawn side by side.
  return rowsOf<MonthPoint>(
    await db.execute(sql`
      ${base(f)},
      months AS (
        SELECT generate_series(
          date_trunc('month', ${f.from}::date),
          date_trunc('month', ${f.to}::date),
          interval '1 month'
        ) AS m
      )
      SELECT to_char(months.m, 'YYYY-MM') AS month,
             count(f.opened)::int AS value
        FROM months
        LEFT JOIN f ON date_trunc('month', f.opened) = months.m
       GROUP BY months.m
       ORDER BY months.m`),
  );
}

/** Ids ranked by files opened in the window; ties go to the lower id. */
async function topBy(column: 'client_id' | 'office_id', from: string, to: string, n: number): Promise<number[]> {
  const rows = rowsOf<{ id: number }>(
    await db.execute(sql`
      ${base({ from, to })}
      SELECT ${sql.identifier(column)} AS id
        FROM f
       WHERE ${sql.identifier(column)} IS NOT NULL
       GROUP BY ${sql.identifier(column)}
       ORDER BY count(*) DESC, ${sql.identifier(column)}
       LIMIT ${n}`),
  );
  return rows.map((r) => Number(r.id));
}

export const trackingComparison: ComparisonModule = {
  metrics: METRICS,
  headline: 'files',
  officeLabel: 'Office',
  directions: [
    { key: 'import', label: 'Import' },
    { key: 'export', label: 'Export' },
  ],
  async offices() {
    const rows = await db
      .select({ id: mainOfficeMaster.id, label: mainOfficeMaster.mainLocationName })
      .from(mainOfficeMaster)
      .where(sql`${mainOfficeMaster.display} = 'Y'`)
      .orderBy(mainOfficeMaster.id);
    return rows.map((r) => ({ id: r.id, label: r.label ?? `Office #${r.id}` }));
  },
  measure,
  monthly,
  topClients: (from, to, n) => topBy('client_id', from, to, n),
  topOffices: (from, to, n) => topBy('office_id', from, to, n),
};
