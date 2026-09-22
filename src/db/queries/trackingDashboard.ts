import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { CLEARING_STATUS, clearingStatusIn, clearingStatusIs } from './clearingStatus';
import { AGEING_BUCKETS } from '@/lib/tracking/ageing';

// §4.29 — the data behind the Import and Export Tracking dashboards.
//
// ONE implementation, two configurations (§4.10). The two tables are symmetric
// in everything that matters here — a client, a clearing status, an anchor date,
// a completion date, a weight, a value and a bag of stage predicates — so
// writing this twice would mean every later fix having to be made twice, which
// is exactly how the five drifting copies of the status filters came about.
//
// Every figure is an aggregate the database evaluates over live rows. Nothing is
// counted from a page of results: the list pages at 20, so a client-side count
// would report "20 files" on a book of four hundred.

/** Which columns and predicates a tracking table offers. */
export interface TrackingDashboardConfig {
  table: PgTable;
  /** Needed explicitly: a bare `id` is ambiguous once the client master joins in. */
  id: AnyPgColumn;
  /**
   * When a file enters the pipeline, and when it leaves.
   *
   * Both are taken from the module's existing `total_journey` KPI stage rather
   * than picked afresh, so "how long did this take" means the same span on the
   * dashboard as it does on /imkpi and /exkpi.
   */
  anchorDate: AnyPgColumn;
  completionDate: AnyPgColumn;
  clientId: AnyPgColumn;
  clearingStatus: AnyPgColumn;
  mcaRef: AnyPgColumn;
  weight: AnyPgColumn;
  fob: AnyPgColumn;
  display: AnyPgColumn;
  /** The module's status-filter predicates, keyed exactly as the list accepts them. */
  predicates: Record<string, SQL>;
  /** Pending stages surfaced as tiles, in the order operators work them. */
  stages: ReadonlyArray<{ key: string; label: string }>;
}

export interface TrackingKpi {
  total: number;
  open: number;
  /**
   * Off the desk: CLEARING COMPLETED plus cleared-with-IR and cleared-with-ARA.
   * This is what `open` is measured against, and it has no single list filter —
   * so the tile showing it does not pretend to be clickable (§4.29).
   */
  cleared: number;
  /** Exactly the list's `completed` filter, so that tile links to what it counted. */
  completed: number;
  cancelled: number;
  in_progress: number;
  in_transit: number;
  this_month: number;
  total_weight: number;
  total_fob: number;
  /** Mean calendar days from anchor to completion, over files that finished. */
  avg_days_to_clear: number | null;
}

export interface TrackingDashboard {
  kpi: TrackingKpi;
  status_breakdown: Array<{ status: string | null; count: number }>;
  pending_stages: Array<{ key: string; label: string; count: number }>;
  monthly: Array<{
    month: string;
    month_name: string;
    opened: number;
    completed: number;
    weight: number;
    fob: number;
  }>;
  ageing: Array<{ key: string; label: string; count: number }>;
  oldest_open: Array<{
    id: number;
    mca_ref: string | null;
    client_name: string | null;
    status: string | null;
    started: string | null;
    days_open: number;
  }>;
  top_clients: Array<{ client_name: string | null; files: number; weight: number; fob: number }>;
}

/** Rows returned by `db.execute`, which is untyped at the boundary. */
function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

export async function getTrackingDashboard(
  config: TrackingDashboardConfig,
): Promise<TrackingDashboard> {
  const {
    table,
    id,
    anchorDate,
    completionDate,
    clientId,
    clearingStatus,
    mcaRef,
    weight,
    fob,
    display,
    predicates,
    stages,
  } = config;

  // Soft-deleted files are out of every figure on this screen (§4.27). They stay
  // readable to history, but a dashboard answers "what needs attention today".
  const live = sql`${display} = 'Y'`;

  // "Finished" is more than CLEARING COMPLETED — a file cleared with an IR or an
  // ARA is off the operator's desk too. Counting only the first would inflate
  // the open figure with files nobody is working on.
  const done = clearingStatusIn(clearingStatus, [
    CLEARING_STATUS.completed,
    CLEARING_STATUS.clearedWithIr,
    CLEARING_STATUS.clearedWithAra,
  ]);
  const cancelled = clearingStatusIs(clearingStatus, CLEARING_STATUS.cancelled);
  // Open = still somebody's problem. A file with no status yet is open: the
  // column is deliberately nullable with no default, so NULL means "not started",
  // not "unknown", and dropping it would hide the files least likely to be moving.
  const open = sql`NOT (${done}) AND NOT (${cancelled})`;

  const [kpi] = rowsOf<{
    total: number;
    open: number;
    cleared: number;
    completed: number;
    cancelled: number;
    in_progress: number;
    in_transit: number;
    this_month: number;
    total_weight: number;
    total_fob: number;
    avg_days_to_clear: number | null;
  }>(
    await db.execute(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE ${open})::int AS open,
        count(*) FILTER (WHERE ${done})::int AS cleared,
        count(*) FILTER (WHERE ${predicates.completed})::int AS completed,
        count(*) FILTER (WHERE ${cancelled})::int AS cancelled,
        count(*) FILTER (WHERE ${predicates.in_progress})::int AS in_progress,
        count(*) FILTER (WHERE ${predicates.in_transit})::int AS in_transit,
        count(*) FILTER (
          WHERE date_trunc('month', ${anchorDate}) = date_trunc('month', current_date)
        )::int AS this_month,
        COALESCE(SUM(${weight}), 0)::float AS total_weight,
        COALESCE(SUM(${fob}), 0)::float AS total_fob,
        AVG(${completionDate} - ${anchorDate}) FILTER (
          WHERE ${completionDate} IS NOT NULL AND ${anchorDate} IS NOT NULL
        )::float AS avg_days_to_clear
      FROM ${table}
      WHERE ${live}`),
  );

  // Grouped by the master's own text so a new status appears here the day it is
  // added, without a deploy (§4.1). NULL is kept as its own row rather than
  // dropped — files with no status set are the ones worth noticing.
  const statusBreakdown = rowsOf<{ status: string | null; count: number }>(
    await db.execute(sql`
      SELECT m.clearing_status AS status, count(*)::int AS count
        FROM ${table}
        LEFT JOIN clearing_status_master_t m ON m.id = ${clearingStatus}
       WHERE ${live}
       GROUP BY m.clearing_status
       ORDER BY count(*) DESC`),
  );

  // One pass for every stage tile, in the same predicates the list filters on —
  // so a tile and the grid it links to can never disagree (§4.10).
  const stageCounts = stages.map(
    (s) => sql`count(*) FILTER (WHERE ${predicates[s.key]})::int AS ${sql.identifier(s.key)}`,
  );
  const [stageRow] = rowsOf<Record<string, number>>(
    await db.execute(sql`
      SELECT ${sql.join(stageCounts, sql`, `)}
        FROM ${table}
       WHERE ${live} AND ${open}`),
  );

  // Twelve months including the empty ones: a gap in a trend is information, and
  // a chart that omits a quiet month draws a straight line through it.
  const monthly = rowsOf<{
    month: string;
    month_name: string;
    opened: number;
    completed: number;
    weight: number;
    fob: number;
  }>(
    await db.execute(sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', current_date) - interval '11 months',
          date_trunc('month', current_date),
          interval '1 month'
        ) AS m
      )
      SELECT to_char(months.m, 'YYYY-MM') AS month,
             to_char(months.m, 'Mon YYYY') AS month_name,
             (SELECT count(*) FROM ${table}
               WHERE ${live} AND date_trunc('month', ${anchorDate}) = months.m)::int AS opened,
             -- Counted on its OWN month, not the month the file opened: a file
             -- opened in March and cleared in May is May's completion. Folding
             -- both into one join would only ever count same-month turnarounds.
             (SELECT count(*) FROM ${table}
               WHERE ${live} AND date_trunc('month', ${completionDate}) = months.m)::int AS completed,
             (SELECT COALESCE(SUM(${weight}), 0) FROM ${table}
               WHERE ${live} AND date_trunc('month', ${anchorDate}) = months.m)::float AS weight,
             (SELECT COALESCE(SUM(${fob}), 0) FROM ${table}
               WHERE ${live} AND date_trunc('month', ${anchorDate}) = months.m)::float AS fob
        FROM months
       ORDER BY months.m`),
  );

  // Ageing is measured over OPEN files only. A finished file that took ninety
  // days is a fact about the past; this chart is about the pile on the desk.
  const ageingCounts = AGEING_BUCKETS.map((b) => {
    const age = sql`(current_date - ${anchorDate})`;
    const within =
      b.max === null
        ? sql`${age} >= ${b.min}`
        : sql`${age} BETWEEN ${b.min} AND ${b.max}`;
    return sql`count(*) FILTER (WHERE ${anchorDate} IS NOT NULL AND ${within})::int AS ${sql.identifier(b.key)}`;
  });
  const [ageingRow] = rowsOf<Record<string, number>>(
    await db.execute(sql`
      SELECT ${sql.join(ageingCounts, sql`, `)}
        FROM ${table}
       WHERE ${live} AND ${open}`),
  );

  // §4.15 — the client is a column on someone else's row here, so the short code.
  const oldestOpen = rowsOf<{
    id: number;
    mca_ref: string | null;
    client_name: string | null;
    status: string | null;
    started: string | null;
    days_open: number;
  }>(
    await db.execute(sql`
      SELECT ${id} AS id,
             ${mcaRef} AS mca_ref,
             c.short_name AS client_name,
             m.clearing_status AS status,
             ${anchorDate} AS started,
             (current_date - ${anchorDate})::int AS days_open
        FROM ${table}
        LEFT JOIN client_master_t c ON c.id = ${clientId}
        LEFT JOIN clearing_status_master_t m ON m.id = ${clearingStatus}
       WHERE ${live} AND ${open} AND ${anchorDate} IS NOT NULL
       ORDER BY ${anchorDate} ASC
       LIMIT 10`),
  );

  const topClients = rowsOf<{
    client_name: string | null;
    files: number;
    weight: number;
    fob: number;
  }>(
    await db.execute(sql`
      SELECT c.short_name AS client_name,
             count(*)::int AS files,
             COALESCE(SUM(${weight}), 0)::float AS weight,
             COALESCE(SUM(${fob}), 0)::float AS fob
        FROM ${table}
        LEFT JOIN client_master_t c ON c.id = ${clientId}
       WHERE ${live}
       GROUP BY c.short_name
       ORDER BY count(*) DESC
       LIMIT 8`),
  );

  return {
    kpi: {
      total: kpi?.total ?? 0,
      open: kpi?.open ?? 0,
      cleared: kpi?.cleared ?? 0,
      completed: kpi?.completed ?? 0,
      cancelled: kpi?.cancelled ?? 0,
      in_progress: kpi?.in_progress ?? 0,
      in_transit: kpi?.in_transit ?? 0,
      this_month: kpi?.this_month ?? 0,
      total_weight: kpi?.total_weight ?? 0,
      total_fob: kpi?.total_fob ?? 0,
      avg_days_to_clear:
        kpi?.avg_days_to_clear === null || kpi?.avg_days_to_clear === undefined
          ? null
          : Math.round(kpi.avg_days_to_clear),
    },
    status_breakdown: statusBreakdown,
    pending_stages: stages.map((s) => ({ ...s, count: stageRow?.[s.key] ?? 0 })),
    monthly,
    ageing: AGEING_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      count: ageingRow?.[b.key] ?? 0,
    })),
    oldest_open: oldestOpen,
    top_clients: topClients,
  };
}
