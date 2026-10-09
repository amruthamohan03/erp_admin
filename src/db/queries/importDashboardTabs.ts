import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importT } from '@/db/schema';
import { CLEARING_STATUS, clearingStatusIn, clearingStatusIs } from './clearingStatus';
import { TRANSPORT, transportModeIs } from './transportMode';
import { getHolidaySet } from './imkpi';
import { IMPORT_DATE_FIELDS, IMPORT_PIPELINE_STEPS } from '@/lib/tracking/importDateFields';
import { ROAD_MILESTONES, ROAD_JOURNEY_END } from '@/lib/tracking/roadMilestones';
import {
  classifyBorderDelay,
  isAtBorder,
  tallyBorderDelays,
  type BorderDelay,
  type BorderTally,
} from '@/lib/tracking/borderDelay';

// §4.29 — the data behind the Import Tracking dashboard's analysis tabs.
//
// The Overview tab is `importDashboard.ts` / `trackingDashboard.ts` and is not
// touched here. This file adds the six tabs that are specific to imports:
// Briefing, Logistics, Tri Phase, Declaration Office, Border and Reports.
//
// Three rules hold throughout, and all three are departures from the PHP this
// replaces rather than translations of it:
//
//  1. Every figure is a SQL aggregate over live rows. Nothing is counted by
//     loading rows and looping — main's briefing tab pulled every completed
//     file into PHP to count 25 missing-date totals by hand, so the counts cost
//     a full table read and could not be filtered server-side.
//  2. Nothing resolves a master by id. Clearing statuses go through
//     `clearingStatus.ts`, transport modes through `transportMode.ts`, and the
//     border posts through the `border_post` flag on the transit-point master.
//  3. Soft-deleted files are out of every figure (§4.27).

/** Rows from `db.execute`, which is untyped at the boundary. */
function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

/** Soft-delete gate, repeated into every query on this screen. */
const LIVE = sql`${importT.display} = 'Y'`;

const DONE = clearingStatusIn(importT.clearingStatus, [
  CLEARING_STATUS.completed,
  CLEARING_STATUS.clearedWithIr,
  CLEARING_STATUS.clearedWithAra,
]);
const COMPLETED = clearingStatusIs(importT.clearingStatus, CLEARING_STATUS.completed);
const IN_PROGRESS = clearingStatusIs(importT.clearingStatus, CLEARING_STATUS.inProgress);
const IN_TRANSIT = clearingStatusIs(importT.clearingStatus, CLEARING_STATUS.inTransit);
const CANCELLED = clearingStatusIs(importT.clearingStatus, CLEARING_STATUS.cancelled);

/** A date column on `imports_t`, addressed by its real name. */
const col = (name: string): SQL => sql`${sql.identifier(name)}`;
/** A date is "filled" when it is neither NULL nor main's zero date. */
const filled = (name: string): SQL => sql`(${col(name)} IS NOT NULL)`;
const missing = (name: string): SQL => sql`(${col(name)} IS NULL)`;

// ===================================================================
// Overview extras — the panels main's Overview tab had and ours did not
// ===================================================================

export interface QuarterRow {
  year: number;
  quarter: number;
  label: string;
  files: number;
  completed: number;
  in_progress: number;
  in_transit: number;
  weight: number;
  fob: number;
  clients: number;
}

export interface PeriodTotals {
  files: number;
  completed: number;
  weight: number;
  fob: number;
  clients: number;
  licenses: number;
}

export interface DistributionRow {
  label: string;
  count: number;
}

export interface TransportStatRow {
  label: string;
  letter: string | null;
  count: number;
  completed: number;
  in_progress: number;
  in_transit: number;
}

export interface StatusCardRow {
  id: number;
  name: string;
  count: number;
}

export interface Month24Row {
  month: string;
  month_name: string;
  month_short: string;
  files: number;
  completed: number;
  in_progress: number;
  in_transit: number;
}

export interface TopClientRow {
  client_name: string | null;
  files: number;
  completed: number;
  in_progress: number;
  weight: number;
  fob: number;
  completion_rate: number;
}

export interface ImportOverviewExtras {
  /** The four headline figures. */
  kpi: { total: number; in_transit: number; in_progress: number; completed: number };
  /**
   * Every status in the master, including those no file carries.
   *
   * Driven from the master side rather than from the files, so a status that
   * nobody has used yet still shows as a zero — which is what makes the row a
   * complete picture of the workflow rather than of this month's traffic.
   */
  status_cards: StatusCardRow[];
  /** Two years of months, for the trend chart, the month strip and the table. */
  monthly_24: Month24Row[];
  top_clients: TopClientRow[];
  /** Counts by when the file was OPENED, which is what these panels are about. */
  periods: { today: number; this_week: number; this_month: number; this_quarter: number; this_year: number };
  quarterly: QuarterRow[];
  month_vs_month: { current: PeriodTotals; previous: PeriodTotals; current_label: string; previous_label: string };
  daily: Array<{ day: number; label: string; files: number; completed: number }>;
  transport: TransportStatRow[];
  distributions: {
    kind: DistributionRow[];
    goods: DistributionRow[];
    clearance: DistributionRow[];
    currency: DistributionRow[];
    entry_point: DistributionRow[];
    regime: DistributionRow[];
  };
}

/**
 * One distribution: files grouped by a referenced master's label.
 *
 * Every one of main's six distributions was a separate 400-character query
 * differing only in the table and column names (§4.10). Empty groups are
 * dropped — a master row nobody has used yet is not a slice of anything — but
 * files whose foreign key is NULL are kept under "Not Specified", because an
 * unset field is exactly what an operator wants to find.
 */
async function distribution(
  table: string,
  labelColumn: string,
  fk: SQL,
  limit?: number,
): Promise<DistributionRow[]> {
  return rowsOf<DistributionRow>(
    await db.execute(sql`
      SELECT COALESCE(m.${sql.identifier(labelColumn)}, 'Not Specified') AS label,
             count(*)::int AS count
        FROM ${importT}
        LEFT JOIN ${sql.identifier(table)} m ON m.id = ${fk} AND m.display = 'Y'
       WHERE ${LIVE}
       GROUP BY COALESCE(m.${sql.identifier(labelColumn)}, 'Not Specified')
       ORDER BY count(*) DESC${limit ? sql` LIMIT ${limit}` : sql``}`),
  );
}

export async function getImportOverviewExtras(): Promise<ImportOverviewExtras> {
  // `created_at` and not the pre-alert date: these panels answer "how much work
  // came in", and a file is work from the moment it is opened. The Overview's
  // own trend is anchored on Pre Alert and says so on the panel — the two
  // answer different questions and are labelled accordingly.
  const opened = sql`${importT.createdAt}`;

  const [periods] = rowsOf<{
    today: number;
    this_week: number;
    this_month: number;
    this_quarter: number;
    this_year: number;
  }>(
    await db.execute(sql`
      SELECT count(*) FILTER (WHERE ${opened}::date = current_date)::int AS today,
             count(*) FILTER (WHERE date_trunc('week', ${opened}) = date_trunc('week', current_date))::int AS this_week,
             count(*) FILTER (WHERE date_trunc('month', ${opened}) = date_trunc('month', current_date))::int AS this_month,
             count(*) FILTER (WHERE date_trunc('quarter', ${opened}) = date_trunc('quarter', current_date))::int AS this_quarter,
             count(*) FILTER (WHERE date_trunc('year', ${opened}) = date_trunc('year', current_date))::int AS this_year
        FROM ${importT}
       WHERE ${LIVE}`),
  );

  const [kpi] = rowsOf<ImportOverviewExtras['kpi']>(
    await db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE ${IN_TRANSIT})::int AS in_transit,
             count(*) FILTER (WHERE ${IN_PROGRESS})::int AS in_progress,
             count(*) FILTER (WHERE ${COMPLETED})::int AS completed
        FROM ${importT}
       WHERE ${LIVE}`),
  );

  // FROM the master, LEFT JOIN the files: the other direction would drop a
  // status with no files, and "nothing is cancelled" is worth seeing.
  const statusCards = rowsOf<StatusCardRow>(
    await db.execute(sql`
      SELECT m.id AS id,
             m.clearing_status AS name,
             count(${importT.id})::int AS count
        FROM clearing_status_master_t m
        LEFT JOIN ${importT} ON ${importT.clearingStatus} = m.id AND ${LIVE}
       WHERE m.display = 'Y'
       GROUP BY m.id, m.clearing_status
       ORDER BY m.id`),
  );

  // Every month in the window, including the empty ones — a generated series
  // rather than GROUP BY, so a quiet month is a gap in the chart instead of
  // two busy months drawn side by side.
  const monthly24 = rowsOf<Month24Row>(
    await db.execute(sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', current_date) - interval '23 months',
          date_trunc('month', current_date),
          interval '1 month'
        ) AS m
      )
      SELECT to_char(months.m, 'YYYY-MM') AS month,
             to_char(months.m, 'Mon YYYY') AS month_name,
             to_char(months.m, 'Mon') AS month_short,
             (SELECT count(*) FROM ${importT}
               WHERE ${LIVE} AND date_trunc('month', ${opened}) = months.m)::int AS files,
             (SELECT count(*) FROM ${importT}
               WHERE ${LIVE} AND date_trunc('month', ${opened}) = months.m AND ${COMPLETED})::int AS completed,
             (SELECT count(*) FROM ${importT}
               WHERE ${LIVE} AND date_trunc('month', ${opened}) = months.m AND ${IN_PROGRESS})::int AS in_progress,
             (SELECT count(*) FROM ${importT}
               WHERE ${LIVE} AND date_trunc('month', ${opened}) = months.m AND ${IN_TRANSIT})::int AS in_transit
        FROM months
       ORDER BY months.m`),
  );

  // This year only, as the panel's title says — a leaderboard over all time
  // would be a different question and would barely move month to month.
  const topClients = rowsOf<TopClientRow>(
    await db.execute(sql`
      SELECT c.short_name AS client_name,
             count(*)::int AS files,
             count(*) FILTER (WHERE ${COMPLETED})::int AS completed,
             count(*) FILTER (WHERE ${IN_PROGRESS})::int AS in_progress,
             COALESCE(SUM(${importT.weight}), 0)::float AS weight,
             COALESCE(SUM(${importT.fob}), 0)::float AS fob,
             round(count(*) FILTER (WHERE ${COMPLETED})::numeric * 100 / count(*), 1)::float AS completion_rate
        FROM ${importT}
        LEFT JOIN client_master_t c ON c.id = ${importT.clientId}
       WHERE ${LIVE} AND date_trunc('year', ${opened}) = date_trunc('year', current_date)
       GROUP BY c.short_name
       ORDER BY count(*) DESC
       LIMIT 10`),
  );

  const quarterly = rowsOf<QuarterRow>(
    await db.execute(sql`
      SELECT EXTRACT(YEAR FROM ${opened})::int AS year,
             EXTRACT(QUARTER FROM ${opened})::int AS quarter,
             'Q' || EXTRACT(QUARTER FROM ${opened})::int || ' ' || EXTRACT(YEAR FROM ${opened})::int AS label,
             count(*)::int AS files,
             count(*) FILTER (WHERE ${COMPLETED})::int AS completed,
             count(*) FILTER (WHERE ${IN_PROGRESS})::int AS in_progress,
             count(*) FILTER (WHERE ${IN_TRANSIT})::int AS in_transit,
             COALESCE(SUM(${importT.weight}), 0)::float AS weight,
             COALESCE(SUM(${importT.fob}), 0)::float AS fob,
             count(DISTINCT ${importT.clientId})::int AS clients
        FROM ${importT}
       WHERE ${LIVE}
         AND ${opened} >= date_trunc('year', current_date) - interval '1 year'
       GROUP BY 1, 2
       ORDER BY 1 DESC, 2 DESC`),
  );

  // Both months in one pass. Two queries would be two table scans for a panel
  // whose whole purpose is the comparison.
  const totals = (when: SQL): SQL[] => [
    sql`count(*) FILTER (WHERE ${when})::int`,
    sql`count(*) FILTER (WHERE ${when} AND ${COMPLETED})::int`,
    sql`COALESCE(SUM(${importT.weight}) FILTER (WHERE ${when}), 0)::float`,
    sql`COALESCE(SUM(${importT.fob}) FILTER (WHERE ${when}), 0)::float`,
    sql`count(DISTINCT ${importT.clientId}) FILTER (WHERE ${when})::int`,
    sql`count(DISTINCT ${importT.licenseId}) FILTER (WHERE ${when})::int`,
  ];
  const thisMonth = sql`date_trunc('month', ${opened}) = date_trunc('month', current_date)`;
  const lastMonth = sql`date_trunc('month', ${opened}) = date_trunc('month', current_date - interval '1 month')`;
  const [mvm] = rowsOf<Record<string, number | string>>(
    await db.execute(sql`
      SELECT ${sql.join(
        [
          ...totals(thisMonth).map((e, i) => sql`${e} AS ${sql.identifier(`c${i}`)}`),
          ...totals(lastMonth).map((e, i) => sql`${e} AS ${sql.identifier(`p${i}`)}`),
          sql`to_char(current_date, 'Mon YYYY') AS current_label`,
          sql`to_char(current_date - interval '1 month', 'Mon YYYY') AS previous_label`,
        ],
        sql`, `,
      )}
        FROM ${importT}
       WHERE ${LIVE}`),
  );
  const period = (p: 'c' | 'p'): PeriodTotals => ({
    files: Number(mvm?.[`${p}0`] ?? 0),
    completed: Number(mvm?.[`${p}1`] ?? 0),
    weight: Number(mvm?.[`${p}2`] ?? 0),
    fob: Number(mvm?.[`${p}3`] ?? 0),
    clients: Number(mvm?.[`${p}4`] ?? 0),
    licenses: Number(mvm?.[`${p}5`] ?? 0),
  });

  // Every day of the current month, including the quiet ones: a gap in a daily
  // bar chart is information, and a series that omits empty days draws Monday
  // next to Thursday.
  const daily = rowsOf<{ day: number; label: string; files: number; completed: number }>(
    await db.execute(sql`
      WITH days AS (
        SELECT generate_series(
          date_trunc('month', current_date),
          date_trunc('month', current_date) + interval '1 month' - interval '1 day',
          interval '1 day'
        )::date AS d
      )
      SELECT EXTRACT(DAY FROM days.d)::int AS day,
             to_char(days.d, 'DD Mon') AS label,
             (SELECT count(*) FROM ${importT}
               WHERE ${LIVE} AND ${opened}::date = days.d)::int AS files,
             (SELECT count(*) FROM ${importT}
               WHERE ${LIVE} AND ${opened}::date = days.d AND ${COMPLETED})::int AS completed
        FROM days
       ORDER BY days.d`),
  );

  const transport = rowsOf<TransportStatRow>(
    await db.execute(sql`
      SELECT COALESCE(m.transport_mode_name, 'Not Specified') AS label,
             m.transport_letter AS letter,
             count(*)::int AS count,
             count(*) FILTER (WHERE ${COMPLETED})::int AS completed,
             count(*) FILTER (WHERE ${IN_PROGRESS})::int AS in_progress,
             count(*) FILTER (WHERE ${IN_TRANSIT})::int AS in_transit
        FROM ${importT}
        LEFT JOIN transport_mode_master_t m ON m.id = ${importT.transportMode} AND m.display = 'Y'
       WHERE ${LIVE}
       GROUP BY m.transport_mode_name, m.transport_letter
       ORDER BY count(*) DESC`),
  );

  const [kind, goods, clearance, currency, entryPoint, regime] = await Promise.all([
    distribution('kind_master_t', 'kind_name', sql`${importT.kind}`),
    distribution('type_of_goods_master_t', 'goods_type', sql`${importT.typeOfGoods}`, 10),
    distribution('clearance_master_t', 'clearance_name', sql`${importT.typesOfClearance}`),
    distribution('currency_master_t', 'currency_name', sql`${importT.currency}`),
    distribution('transit_point_master_t', 'transit_point_name', sql`${importT.entryPointId}`, 10),
    distribution('regime_master_t', 'regime_name', sql`${importT.regime}`),
  ]);

  return {
    kpi: {
      total: kpi?.total ?? 0,
      in_transit: kpi?.in_transit ?? 0,
      in_progress: kpi?.in_progress ?? 0,
      completed: kpi?.completed ?? 0,
    },
    status_cards: statusCards,
    monthly_24: monthly24,
    top_clients: topClients,
    periods: {
      today: periods?.today ?? 0,
      this_week: periods?.this_week ?? 0,
      this_month: periods?.this_month ?? 0,
      this_quarter: periods?.this_quarter ?? 0,
      this_year: periods?.this_year ?? 0,
    },
    quarterly,
    month_vs_month: {
      current: period('c'),
      previous: period('p'),
      current_label: String(mvm?.current_label ?? ''),
      previous_label: String(mvm?.previous_label ?? ''),
    },
    daily,
    transport,
    distributions: { kind, goods, clearance, currency, entry_point: entryPoint, regime },
  };
}

// ===================================================================
// Briefing — date completeness across cleared files
// ===================================================================

export interface BriefingFile {
  id: number;
  mca_ref: string | null;
  client_name: string | null;
  transport_mode: string | null;
  /** Master letter, so the matrix can tell an unfilled date from an inapplicable one. */
  transport_letter: string | null;
  clearance_type: string | null;
  entry_point: string | null;
  goods_type: string | null;
  /** Every tracked date, keyed by column name — null where unfilled. */
  dates: Record<string, string | null>;
}

export interface ImportBriefing {
  files: BriefingFile[];
  /** Files in scope that are missing each date, counted in SQL. */
  missing: Record<string, number>;
  total: number;
}

/**
 * The briefing scope: files the operation considers CLEARED.
 *
 * Main used `clearing_status = 6` — the single CLEARING COMPLETED id. That
 * leaves out files cleared with an IR or an ARA, which are equally finished and
 * equally in need of a complete date record before they are archived, so the
 * tab silently under-reported the work remaining.
 */
export async function getImportBriefing(): Promise<ImportBriefing> {
  // The keys are cast explicitly: as bare bind parameters Postgres cannot
  // infer their type inside jsonb_build_object and rejects the whole statement.
  const dateObject = sql.join(
    IMPORT_DATE_FIELDS.flatMap((f) => [sql`${f.key}::text`, col(f.key)]),
    sql`, `,
  );

  const files = rowsOf<BriefingFile>(
    await db.execute(sql`
      SELECT ${importT.id} AS id,
             ${importT.mcaRef} AS mca_ref,
             c.short_name AS client_name,
             tm.transport_mode_name AS transport_mode,
             tm.transport_letter AS transport_letter,
             ct.clearance_name AS clearance_type,
             ep.transit_point_name AS entry_point,
             tg.goods_type AS goods_type,
             jsonb_build_object(${dateObject}) AS dates
        FROM ${importT}
        LEFT JOIN client_master_t c ON c.id = ${importT.clientId}
        LEFT JOIN transport_mode_master_t tm ON tm.id = ${importT.transportMode}
        LEFT JOIN clearance_master_t ct ON ct.id = ${importT.typesOfClearance}
        LEFT JOIN transit_point_master_t ep ON ep.id = ${importT.entryPointId}
        LEFT JOIN type_of_goods_master_t tg ON tg.id = ${importT.typeOfGoods}
       WHERE ${LIVE} AND ${DONE}
       ORDER BY ${importT.createdAt} DESC`),
  );

  // Counted in SQL over the same scope, not by looping the rows above: the
  // figure must stay right when the table is later paged or filtered.
  //
  // Scoped by transport exactly as the export is (`missingDateCondition`), so
  // the card's figure and the sheet it downloads are the same number. Counting
  // an airport date as missing from a truck reported the whole road book as
  // incomplete and then downloaded nothing.
  const [missingRow] = rowsOf<Record<string, number>>(
    await db.execute(sql`
      SELECT ${sql.join(
        IMPORT_DATE_FIELDS.map(
          (f) =>
            sql`count(*) FILTER (
              WHERE ${missingDateCondition(f.key, f.transportLetter)}
            )::int AS ${sql.identifier(f.key)}`,
        ),
        sql`, `,
      )}
        FROM ${importT}
       WHERE ${LIVE} AND ${DONE}`),
  );

  const missingCounts: Record<string, number> = {};
  for (const f of IMPORT_DATE_FIELDS) missingCounts[f.key] = missingRow?.[f.key] ?? 0;

  return { files, missing: missingCounts, total: files.length };
}

// ===================================================================
// Logistics — where road consignments are on the journey
// ===================================================================

export interface RoadStageRow {
  key: string;
  label: string;
  count: number;
}

export interface ImportLogistics {
  total: number;
  completed: number;
  stages: RoadStageRow[];
}

/** True for a road file waiting AT `key`: this leg unrecorded, the previous done. */
export function roadStageCondition(index: number): SQL {
  const m = ROAD_MILESTONES[index];
  const prev = index > 0 ? ROAD_MILESTONES[index - 1] : null;
  return prev ? sql`(${missing(m.column)} AND ${filled(prev.column)})` : missing(m.column);
}

export async function getImportLogistics(): Promise<ImportLogistics> {
  const road = transportModeIs(importT.transportMode, TRANSPORT.road);

  const [row] = rowsOf<Record<string, number>>(
    await db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE ${filled(ROAD_JOURNEY_END.column)})::int AS completed,
             ${sql.join(
               ROAD_MILESTONES.map(
                 (m, i) =>
                   sql`count(*) FILTER (WHERE ${roadStageCondition(i)})::int AS ${sql.identifier(m.key)}`,
               ),
               sql`, `,
             )}
        FROM ${importT}
       WHERE ${LIVE} AND ${road}`),
  );

  return {
    total: row?.total ?? 0,
    completed: row?.completed ?? 0,
    stages: ROAD_MILESTONES.map((m) => ({ key: m.key, label: m.label, count: row?.[m.key] ?? 0 })),
  };
}

// ===================================================================
// Tri Phase — the month split into thirds
// ===================================================================

export interface TriPhaseClientRow {
  client_name: string | null;
  total: number;
  phase1: number;
  phase2: number;
  phase3: number;
}

export interface ImportTriPhase {
  month_label: string;
  total: number;
  phase1: number;
  phase2: number;
  phase3: number;
  by_client: TriPhaseClientRow[];
}

/** Day-of-month bands, as the operation divides its month. */
const PHASES = [
  { key: 'phase1', from: 1, to: 10 },
  { key: 'phase2', from: 11, to: 20 },
  { key: 'phase3', from: 21, to: 31 },
] as const;

export async function getImportTriPhase(): Promise<ImportTriPhase> {
  const day = sql`EXTRACT(DAY FROM ${importT.createdAt})`;
  const phaseCounts = (): SQL[] =>
    PHASES.map(
      (p) =>
        sql`count(*) FILTER (WHERE ${day} BETWEEN ${p.from} AND ${p.to})::int AS ${sql.identifier(p.key)}`,
    );

  const thisMonth = sql`date_trunc('month', ${importT.createdAt}) = date_trunc('month', current_date)`;

  const [overview] = rowsOf<Record<string, number | string>>(
    await db.execute(sql`
      SELECT to_char(current_date, 'Mon YYYY') AS month_label,
             count(*)::int AS total,
             ${sql.join(phaseCounts(), sql`, `)}
        FROM ${importT}
       WHERE ${LIVE} AND ${thisMonth}`),
  );

  // Three months, not one: a single month's split is too small to read a
  // pattern from, and the by-client table is where a pattern would show.
  const byClient = rowsOf<TriPhaseClientRow>(
    await db.execute(sql`
      SELECT c.short_name AS client_name,
             count(*)::int AS total,
             ${sql.join(phaseCounts(), sql`, `)}
        FROM ${importT}
        LEFT JOIN client_master_t c ON c.id = ${importT.clientId}
       WHERE ${LIVE} AND ${importT.createdAt} >= current_date - interval '3 months'
       GROUP BY c.short_name
       ORDER BY count(*) DESC
       LIMIT 15`),
  );

  return {
    month_label: String(overview?.month_label ?? ''),
    total: Number(overview?.total ?? 0),
    phase1: Number(overview?.phase1 ?? 0),
    phase2: Number(overview?.phase2 ?? 0),
    phase3: Number(overview?.phase3 ?? 0),
    by_client: byClient,
  };
}

// ===================================================================
// Declaration Office
// ===================================================================

export interface OfficeRow {
  office_name: string | null;
  files: number;
  completed: number;
  in_progress: number;
  in_transit: number;
  clearance_rate: number;
  avg_clearance_days: number | null;
}

export interface ImportOffices {
  offices: number;
  files: number;
  completed: number;
  avg_clearance_days: number | null;
  rows: OfficeRow[];
}

export async function getImportOffices(): Promise<ImportOffices> {
  const hasOffice = sql`${importT.declarationOfficeId} IS NOT NULL`;
  // Clearance time at an office is DGDA In to DGDA Out — the span the office
  // itself controls, not the file's whole life.
  const clearanceDays = sql`(${importT.dgdaOutDate} - ${importT.dgdaInDate})`;
  const measurable = sql`${importT.dgdaOutDate} IS NOT NULL AND ${importT.dgdaInDate} IS NOT NULL`;

  const [summary] = rowsOf<{
    offices: number;
    files: number;
    completed: number;
    avg_clearance_days: number | null;
  }>(
    await db.execute(sql`
      SELECT count(DISTINCT ${importT.declarationOfficeId})::int AS offices,
             count(*)::int AS files,
             count(*) FILTER (WHERE ${COMPLETED})::int AS completed,
             AVG(${clearanceDays}) FILTER (WHERE ${measurable})::float AS avg_clearance_days
        FROM ${importT}
       WHERE ${LIVE} AND ${hasOffice}`),
  );

  const rows = rowsOf<OfficeRow>(
    await db.execute(sql`
      SELECT COALESCE(o.sub_office_name, 'Not Specified') AS office_name,
             count(*)::int AS files,
             count(*) FILTER (WHERE ${COMPLETED})::int AS completed,
             count(*) FILTER (WHERE ${IN_PROGRESS})::int AS in_progress,
             count(*) FILTER (WHERE ${IN_TRANSIT})::int AS in_transit,
             round(count(*) FILTER (WHERE ${COMPLETED})::numeric * 100 / count(*), 1)::float AS clearance_rate,
             AVG(${clearanceDays}) FILTER (WHERE ${measurable})::float AS avg_clearance_days
        FROM ${importT}
        LEFT JOIN sub_office_master_t o ON o.id = ${importT.declarationOfficeId}
       WHERE ${LIVE} AND ${hasOffice}
       GROUP BY COALESCE(o.sub_office_name, 'Not Specified')
       ORDER BY count(*) DESC`),
  );

  return {
    offices: summary?.offices ?? 0,
    files: summary?.files ?? 0,
    completed: summary?.completed ?? 0,
    avg_clearance_days:
      summary?.avg_clearance_days === null || summary?.avg_clearance_days === undefined
        ? null
        : Math.round(summary.avg_clearance_days * 10) / 10,
    rows: rows.map((r) => ({
      ...r,
      avg_clearance_days:
        r.avg_clearance_days === null ? null : Math.round(r.avg_clearance_days * 10) / 10,
    })),
  };
}

// ===================================================================
// Border — overstay at the configured border posts
// ===================================================================

export interface BorderFile {
  id: number;
  mca_ref: string | null;
  client_name: string | null;
  horse: string | null;
  trailer_1: string | null;
  trailer_2: string | null;
  container: string | null;
  entry_point: string | null;
  commodity: string | null;
  document_status: string | null;
  clearing_status: string | null;
  weight: number | null;
  fob: number | null;
  drc_entry_date: string | null;
  border_warehouse_arrival_date: string | null;
  dispatch_from_border: string | null;
  warehouse_arrival_date: string | null;
  border_max_working_days: number | null;
  remarks: unknown;
  /** Resolved server-side so one implementation decides every reading. */
  delay: BorderDelay;
}

export interface ImportBorder {
  /** The posts the rule is configured for, for the screen's own explanation. */
  posts: Array<{ name: string; limit: number }>;
  kpi: {
    total: number;
    waiting_drc_entry: number;
    waiting_dispatch: number;
    both_dates_filled: number;
    in_transit: number;
    in_progress: number;
    completed: number;
    this_month: number;
    this_year: number;
  };
  /** Files still at the border, oldest entry first. */
  files: BorderFile[];
  tally: BorderTally;
}

/** True for a file whose entry point is flagged as a border post (§4.1). */
const AT_BORDER_POST = sql`${importT.entryPointId} IN (
  SELECT id FROM transit_point_master_t WHERE border_post = true AND display = 'Y')`;

export async function getImportBorder(): Promise<ImportBorder> {
  const road = transportModeIs(importT.transportMode, TRANSPORT.road);
  const scope = sql`${LIVE} AND ${road} AND ${AT_BORDER_POST}`;

  const posts = rowsOf<{ name: string; limit: number }>(
    await db.execute(sql`
      SELECT transit_point_name AS name, border_max_working_days AS "limit"
        FROM transit_point_master_t
       WHERE border_post = true AND display = 'Y'
       ORDER BY id`),
  );

  const [kpi] = rowsOf<ImportBorder['kpi']>(
    await db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE ${missing('drc_entry_date')})::int AS waiting_drc_entry,
             count(*) FILTER (
               WHERE ${filled('drc_entry_date')} AND ${missing('dispatch_from_border')}
             )::int AS waiting_dispatch,
             count(*) FILTER (
               WHERE ${filled('drc_entry_date')} AND ${filled('dispatch_from_border')}
             )::int AS both_dates_filled,
             count(*) FILTER (WHERE ${IN_TRANSIT})::int AS in_transit,
             count(*) FILTER (WHERE ${IN_PROGRESS})::int AS in_progress,
             count(*) FILTER (WHERE ${COMPLETED})::int AS completed,
             count(*) FILTER (
               WHERE date_trunc('month', ${importT.createdAt}) = date_trunc('month', current_date)
             )::int AS this_month,
             count(*) FILTER (
               WHERE date_trunc('year', ${importT.createdAt}) = date_trunc('year', current_date)
             )::int AS this_year
        FROM ${importT}
       WHERE ${scope}`),
  );

  // Only the files still at the border. The allowance rides along from the post
  // so the classifier never has to look a second value up.
  const raw = rowsOf<Omit<BorderFile, 'delay'>>(
    await db.execute(sql`
      SELECT ${importT.id} AS id,
             ${importT.mcaRef} AS mca_ref,
             c.short_name AS client_name,
             ${importT.horse} AS horse,
             ${importT.trailer1} AS trailer_1,
             ${importT.trailer2} AS trailer_2,
             ${importT.container} AS container,
             ep.transit_point_name AS entry_point,
             com.commodity_name AS commodity,
             ds.document_status AS document_status,
             cs.clearing_status AS clearing_status,
             ${importT.weight}::float AS weight,
             ${importT.fob}::float AS fob,
             ${importT.drcEntryDate} AS drc_entry_date,
             ${importT.borderWarehouseArrivalDate} AS border_warehouse_arrival_date,
             ${importT.dispatchFromBorder} AS dispatch_from_border,
             ${importT.warehouseArrivalDate} AS warehouse_arrival_date,
             ep.border_max_working_days AS border_max_working_days,
             ${importT.remarks} AS remarks
        FROM ${importT}
        LEFT JOIN client_master_t c ON c.id = ${importT.clientId}
        LEFT JOIN transit_point_master_t ep ON ep.id = ${importT.entryPointId}
        LEFT JOIN commodity_master_t com ON com.id = ${importT.commodity}
        LEFT JOIN document_status_master_t ds ON ds.id = ${importT.documentStatus}
        LEFT JOIN clearing_status_master_t cs ON cs.id = ${importT.clearingStatus}
       WHERE ${scope}
         AND ${importT.warehouseArrivalDate} IS NULL
         AND ${importT.dispatchFromBorder} IS NULL
       ORDER BY ${importT.drcEntryDate} ASC NULLS LAST`),
  );

  const holidays = await getHolidaySet();
  const [todayRow] = rowsOf<{ today: string }>(
    // The database's date, not the Node process's: the two can differ by a day
    // across a timezone boundary, and every other figure here came from the DB.
    await db.execute(sql`SELECT to_char(current_date, 'YYYY-MM-DD') AS today`),
  );
  const today = todayRow?.today ?? new Date().toISOString().slice(0, 10);

  const files = raw
    .filter((f) => isAtBorder(f))
    .map((f) => ({ ...f, delay: classifyBorderDelay(f, holidays, today) }));

  return {
    posts,
    kpi: kpi ?? {
      total: 0,
      waiting_drc_entry: 0,
      waiting_dispatch: 0,
      both_dates_filled: 0,
      in_transit: 0,
      in_progress: 0,
      completed: 0,
      this_month: 0,
      this_year: 0,
    },
    files,
    tally: tallyBorderDelays(files.map((f) => f.delay)),
  };
}

/** The ids of files currently overstaying — what the overstay export needs. */
export async function getOverstayingImportIds(): Promise<number[]> {
  const { files } = await getImportBorder();
  return files.filter((f) => f.delay.outcome === 'delayed').map((f) => f.id);
}

// ===================================================================
// Reports — missing-date and pipeline counts, filtered
// ===================================================================

export interface ReportFilters {
  client_id?: number | undefined;
  /** Inclusive range over the file's creation date. */
  from?: string | undefined;
  to?: string | undefined;
}

export interface ImportReportCounts {
  missing: Record<string, number>;
  pipeline: Record<string, number>;
}

/** The filter clause shared by the report counts and every report export. */
export function reportFilterCondition(f: ReportFilters): SQL {
  const conds: SQL[] = [LIVE];
  if (f.client_id !== undefined) conds.push(sql`${importT.clientId} = ${f.client_id}`);
  if (f.from) conds.push(sql`${importT.createdAt}::date >= ${f.from}`);
  if (f.to) conds.push(sql`${importT.createdAt}::date <= ${f.to}`);
  return sql.join(conds, sql` AND `);
}

/**
 * A missing-date count, scoped to the transport mode the field applies to.
 *
 * Without the scope the two airport dates report the entire road book as
 * incomplete — 24 cards where two are meaningless and alarming.
 */
export function missingDateCondition(field: string, transportLetter?: 'A'): SQL {
  const base = missing(field);
  return transportLetter
    ? sql`(${base} AND ${transportModeIs(importT.transportMode, transportLetter)})`
    : base;
}

/** A pipeline step: every earlier gate passed, this one not. */
export function pipelineCondition(key: string): SQL | null {
  const step = IMPORT_PIPELINE_STEPS.find((s) => s.key === key);
  if (!step) return null;
  const parts = [...step.after.map((a) => filled(a)), missing(step.missing)];
  return sql`(${sql.join(parts, sql` AND `)})`;
}

export async function getImportReportCounts(f: ReportFilters): Promise<ImportReportCounts> {
  const where = reportFilterCondition(f);

  const [row] = rowsOf<Record<string, number>>(
    await db.execute(sql`
      SELECT ${sql.join(
        [
          ...IMPORT_DATE_FIELDS.map(
            (d) =>
              sql`count(*) FILTER (WHERE ${missingDateCondition(d.key, d.transportLetter)})::int AS ${sql.identifier(d.key)}`,
          ),
          ...IMPORT_PIPELINE_STEPS.map(
            (s) => sql`count(*) FILTER (WHERE ${pipelineCondition(s.key)})::int AS ${sql.identifier(s.key)}`,
          ),
        ],
        sql`, `,
      )}
        FROM ${importT}
       WHERE ${where}`),
  );

  const missingCounts: Record<string, number> = {};
  for (const d of IMPORT_DATE_FIELDS) missingCounts[d.key] = row?.[d.key] ?? 0;
  const pipeline: Record<string, number> = {};
  for (const s of IMPORT_PIPELINE_STEPS) pipeline[s.key] = row?.[s.key] ?? 0;

  return { missing: missingCounts, pipeline };
}

/** Clients that actually have import files, for the report filters (§4.15). */
export async function getImportClientOptions(): Promise<Array<{ id: number; label: string }>> {
  return rowsOf<{ id: number; label: string }>(
    await db.execute(sql`
      SELECT c.id AS id, c.short_name AS label
        FROM client_master_t c
       WHERE c.display = 'Y'
         AND EXISTS (SELECT 1 FROM ${importT} WHERE ${importT.clientId} = c.id AND ${LIVE})
       ORDER BY c.id`),
  );
}
