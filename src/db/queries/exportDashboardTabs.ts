import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT } from '@/db/schema';
import { CLEARING_STATUS, clearingStatusIs } from './clearingStatus';
import {
  EXPORT_AGENCIES,
  EXPORT_MILESTONES,
  EXPORT_PROCESSING_SPANS,
  EXPORT_TIMELINE_SPANS,
  EXPORT_TRANSIT_SPANS,
  EXPORT_JOURNEY_END,
} from '@/lib/tracking/exportDateFields';

// §4.29 — the data behind the Export Tracking dashboard's five tabs.
//
// Same three rules as the Import dashboard's (`importDashboardTabs.ts`):
// every figure is a SQL aggregate over live rows, no master is resolved by id,
// and soft-deleted files are out of every figure (§4.27).
//
// The repetition main could not avoid is generated here instead: the five
// agency fee totals, the nine timeline averages and the four processing spans
// all come from the lists in `exportDateFields.ts`, so adding an agency or a
// milestone is one entry rather than an edit in three queries.

/** Rows from `db.execute`, which is untyped at the boundary. */
function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

const LIVE = sql`${exportT.display} = 'Y'`;
const COMPLETED = clearingStatusIs(exportT.clearingStatus, CLEARING_STATUS.completed);
const IN_PROGRESS = clearingStatusIs(exportT.clearingStatus, CLEARING_STATUS.inProgress);
const IN_TRANSIT = clearingStatusIs(exportT.clearingStatus, CLEARING_STATUS.inTransit);

const col = (name: string): SQL => sql`${sql.identifier(name)}`;
const filled = (name: string): SQL => sql`(${col(name)} IS NOT NULL)`;
const missing = (name: string): SQL => sql`(${col(name)} IS NULL)`;

/** Mean days between two date columns, over the rows that have both. */
const avgDays = (from: string, to: string): SQL =>
  sql`AVG(${col(to)} - ${col(from)}) FILTER (WHERE ${filled(from)} AND ${filled(to)})::float`;

/** A rounded average, or null where nothing could be measured. */
const round1 = (v: number | null | undefined): number | null =>
  v === null || v === undefined ? null : Math.round(v * 10) / 10;

// ===================================================================
// Shared shapes
// ===================================================================

export interface DistributionRow {
  label: string;
  count: number;
}

export interface SpanRow {
  key: string;
  label: string;
  days: number | null;
}

export interface TransportStatRow {
  label: string;
  letter: string | null;
  count: number;
  completed: number;
  in_progress: number;
  in_transit: number;
}

/**
 * One distribution: files grouped by a referenced master's label.
 *
 * Empty groups are dropped — a master row nobody has used is not a slice of
 * anything — but files whose foreign key is NULL are kept under "Not
 * Specified", because an unset field is exactly what an operator wants to find.
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
        FROM ${exportT}
        LEFT JOIN ${sql.identifier(table)} m ON m.id = ${fk} AND m.display = 'Y'
       WHERE ${LIVE}
       GROUP BY COALESCE(m.${sql.identifier(labelColumn)}, 'Not Specified')
       ORDER BY count(*) DESC${limit ? sql` LIMIT ${limit}` : sql``}`),
  );
}

/** Every span in a list, as one row of averages. */
async function spans(
  list: ReadonlyArray<{ key: string; label: string; from: string; to: string }>,
): Promise<SpanRow[]> {
  const [row] = rowsOf<Record<string, number | null>>(
    await db.execute(sql`
      SELECT ${sql.join(
        list.map((s) => sql`${avgDays(s.from, s.to)} AS ${sql.identifier(s.key)}`),
        sql`, `,
      )}
        FROM ${exportT}
       WHERE ${LIVE}`),
  );
  return list.map((s) => ({ key: s.key, label: s.label, days: round1(row?.[s.key]) }));
}

// ===================================================================
// Overview
// ===================================================================

export interface ExportOverview {
  kpi: {
    total: number;
    in_transit: number;
    in_progress: number;
    completed: number;
    today: number;
    this_week: number;
    this_month: number;
    this_year: number;
    total_weight: number;
    total_fob: number;
  };
  extended: {
    unique_invoices: number;
    unique_buyers: number;
    total_seals: number;
    total_bags: number;
    assay_completed: number;
    avg_customs_days: number | null;
  };
  status_cards: Array<{ id: number; name: string; count: number }>;
  monthly: Array<{ month: string; month_name: string; month_short: string; files: number; weight: number; fob: number }>;
  timeline: SpanRow[];
  transport: TransportStatRow[];
  distributions: {
    kind: DistributionRow[];
    goods: DistributionRow[];
    clearance: DistributionRow[];
    currency: DistributionRow[];
    exit_point: DistributionRow[];
    regime: DistributionRow[];
  };
  recent: Array<{
    id: number;
    mca_ref: string | null;
    invoice: string | null;
    client_name: string | null;
    buyer: string | null;
    kind: string | null;
    weight: number | null;
    fob: number | null;
    status: string | null;
    created_at: string | null;
  }>;
}

export async function getExportOverview(): Promise<ExportOverview> {
  const opened = sql`${exportT.createdAt}`;

  const [kpi] = rowsOf<ExportOverview['kpi']>(
    await db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE ${IN_TRANSIT})::int AS in_transit,
             count(*) FILTER (WHERE ${IN_PROGRESS})::int AS in_progress,
             count(*) FILTER (WHERE ${COMPLETED})::int AS completed,
             count(*) FILTER (WHERE ${opened}::date = current_date)::int AS today,
             count(*) FILTER (WHERE date_trunc('week', ${opened}) = date_trunc('week', current_date))::int AS this_week,
             count(*) FILTER (WHERE date_trunc('month', ${opened}) = date_trunc('month', current_date))::int AS this_month,
             count(*) FILTER (WHERE date_trunc('year', ${opened}) = date_trunc('year', current_date))::int AS this_year,
             COALESCE(SUM(${exportT.weight}), 0)::float AS total_weight,
             COALESCE(SUM(${exportT.fob}), 0)::float AS total_fob
        FROM ${exportT}
       WHERE ${LIVE}`),
  );

  const [extended] = rowsOf<ExportOverview['extended']>(
    await db.execute(sql`
      SELECT count(DISTINCT ${exportT.invoice})::int AS unique_invoices,
             count(DISTINCT ${exportT.buyer})::int AS unique_buyers,
             COALESCE(SUM(${exportT.numberOfSeals}), 0)::int AS total_seals,
             COALESCE(SUM(${exportT.numberOfBags}), 0)::int AS total_bags,
             count(*) FILTER (WHERE ${filled('assay_date')})::int AS assay_completed,
             ${avgDays('dgda_in_date', 'dgda_out_date')} AS avg_customs_days
        FROM ${exportT}
       WHERE ${LIVE}`),
  );

  // FROM the master, LEFT JOIN the files: the other direction drops a status
  // no file carries, and "nothing is cancelled" is worth seeing.
  const statusCards = rowsOf<{ id: number; name: string; count: number }>(
    await db.execute(sql`
      SELECT m.id AS id, m.clearing_status AS name, count(${exportT.id})::int AS count
        FROM clearing_status_master_t m
        LEFT JOIN ${exportT} ON ${exportT.clearingStatus} = m.id AND ${LIVE}
       WHERE m.display = 'Y'
       GROUP BY m.id, m.clearing_status
       ORDER BY m.id`),
  );

  // Every month in the window, including the empty ones — a generated series
  // rather than GROUP BY, so a quiet month is a gap rather than two busy
  // months drawn side by side.
  const monthly = rowsOf<ExportOverview['monthly'][number]>(
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
             to_char(months.m, 'Mon') AS month_short,
             (SELECT count(*) FROM ${exportT}
               WHERE ${LIVE} AND date_trunc('month', ${opened}) = months.m)::int AS files,
             (SELECT COALESCE(SUM(${exportT.weight}), 0) FROM ${exportT}
               WHERE ${LIVE} AND date_trunc('month', ${opened}) = months.m)::float AS weight,
             (SELECT COALESCE(SUM(${exportT.fob}), 0) FROM ${exportT}
               WHERE ${LIVE} AND date_trunc('month', ${opened}) = months.m)::float AS fob
        FROM months
       ORDER BY months.m`),
  );

  const transport = rowsOf<TransportStatRow>(
    await db.execute(sql`
      SELECT COALESCE(m.transport_mode_name, 'Not Specified') AS label,
             m.transport_letter AS letter,
             count(*)::int AS count,
             count(*) FILTER (WHERE ${COMPLETED})::int AS completed,
             count(*) FILTER (WHERE ${IN_PROGRESS})::int AS in_progress,
             count(*) FILTER (WHERE ${IN_TRANSIT})::int AS in_transit
        FROM ${exportT}
        LEFT JOIN transport_mode_master_t m ON m.id = ${exportT.transportMode} AND m.display = 'Y'
       WHERE ${LIVE}
       GROUP BY m.transport_mode_name, m.transport_letter
       ORDER BY count(*) DESC`),
  );

  const recent = rowsOf<ExportOverview['recent'][number]>(
    await db.execute(sql`
      SELECT ${exportT.id} AS id,
             ${exportT.mcaRef} AS mca_ref,
             ${exportT.invoice} AS invoice,
             c.short_name AS client_name,
             ${exportT.buyer} AS buyer,
             k.kind_name AS kind,
             ${exportT.weight}::float AS weight,
             ${exportT.fob}::float AS fob,
             cs.clearing_status AS status,
             to_char(${exportT.createdAt}, 'YYYY-MM-DD') AS created_at
        FROM ${exportT}
        LEFT JOIN client_master_t c ON c.id = ${exportT.clientId}
        LEFT JOIN kind_master_t k ON k.id = ${exportT.kind}
        LEFT JOIN clearing_status_master_t cs ON cs.id = ${exportT.clearingStatus}
       WHERE ${LIVE}
       ORDER BY ${exportT.createdAt} DESC
       LIMIT 50`),
  );

  const [timeline, kind, goods, clearance, currency, exitPoint, regime] = await Promise.all([
    spans(EXPORT_TIMELINE_SPANS),
    distribution('kind_master_t', 'kind_name', sql`${exportT.kind}`),
    distribution('type_of_goods_master_t', 'goods_type', sql`${exportT.typeOfGoods}`, 10),
    distribution('clearance_master_t', 'clearance_name', sql`${exportT.typesOfClearance}`),
    distribution('currency_master_t', 'currency_name', sql`${exportT.currency}`),
    distribution('transit_point_master_t', 'transit_point_name', sql`${exportT.exitPointId}`, 10),
    distribution('regime_master_t', 'regime_name', sql`${exportT.regime}`),
  ]);

  return {
    kpi: kpi ?? {
      total: 0, in_transit: 0, in_progress: 0, completed: 0,
      today: 0, this_week: 0, this_month: 0, this_year: 0,
      total_weight: 0, total_fob: 0,
    },
    extended: {
      unique_invoices: extended?.unique_invoices ?? 0,
      unique_buyers: extended?.unique_buyers ?? 0,
      total_seals: extended?.total_seals ?? 0,
      total_bags: extended?.total_bags ?? 0,
      assay_completed: extended?.assay_completed ?? 0,
      avg_customs_days: round1(extended?.avg_customs_days),
    },
    status_cards: statusCards,
    monthly,
    timeline,
    transport,
    distributions: { kind, goods, clearance, currency, exit_point: exitPoint, regime },
    recent,
  };
}

// ===================================================================
// Logistics
// ===================================================================

export interface ExportLogistics {
  overview: {
    loaded: number;
    kanyaka_arrivals: number;
    border_arrivals: number;
    drc_exits: number;
    road_shipments: number;
    rail_shipments: number;
    container_shipments: number;
    total_weight: number;
    total_seals: number;
  };
  stages: Array<{ key: string; label: string; count: number }>;
  completed: number;
  transit: SpanRow[];
  processing: Array<{ key: string; label: string; days: number | null; processed: number }>;
  vehicles: Array<{ label: string; shipments: number; unique: number; weight: number }>;
  container_types: DistributionRow[];
  truck_status: DistributionRow[];
  monthly: Array<{ month_short: string; border_arrivals: number; drc_exits: number }>;
}

/** True for a file waiting AT `index`: this leg unrecorded, the previous done. */
export function exportStageCondition(index: number): SQL {
  const m = EXPORT_MILESTONES[index];
  const prev = index > 0 ? EXPORT_MILESTONES[index - 1] : null;
  return prev ? sql`(${missing(m.column)} AND ${filled(prev.column)})` : missing(m.column);
}

export async function getExportLogistics(): Promise<ExportLogistics> {
  const hasText = (c: SQL): SQL => sql`(${c} IS NOT NULL AND ${c} <> '')`;

  const [row] = rowsOf<Record<string, number>>(
    await db.execute(sql`
      SELECT count(*) FILTER (WHERE ${filled('loading_date')})::int AS loaded,
             count(*) FILTER (WHERE ${filled('kanyaka_arrival_date')})::int AS kanyaka_arrivals,
             count(*) FILTER (WHERE ${filled('border_arrival_date')})::int AS border_arrivals,
             count(*) FILTER (WHERE ${filled('exit_drc_date')})::int AS drc_exits,
             count(*) FILTER (WHERE ${hasText(sql`${exportT.horse}`)})::int AS road_shipments,
             count(*) FILTER (WHERE ${hasText(sql`${exportT.wagonRef}`)})::int AS rail_shipments,
             count(*) FILTER (WHERE ${hasText(sql`${exportT.container}`)})::int AS container_shipments,
             COALESCE(SUM(${exportT.weight}), 0)::float AS total_weight,
             COALESCE(SUM(${exportT.numberOfSeals}), 0)::int AS total_seals,
             count(*) FILTER (WHERE ${filled(EXPORT_JOURNEY_END.column)})::int AS completed,
             ${sql.join(
               EXPORT_MILESTONES.map(
                 (m, i) =>
                   sql`count(*) FILTER (WHERE ${exportStageCondition(i)})::int AS ${sql.identifier(m.key)}`,
               ),
               sql`, `,
             )}
        FROM ${exportT}
       WHERE ${LIVE}`),
  );

  const [procRow] = rowsOf<Record<string, number | null>>(
    await db.execute(sql`
      SELECT ${sql.join(
        EXPORT_PROCESSING_SPANS.flatMap((s) => [
          sql`${avgDays(s.from, s.to)} AS ${sql.identifier(`${s.key}_days`)}`,
          sql`count(*) FILTER (WHERE ${filled(s.from)})::int AS ${sql.identifier(`${s.key}_count`)}`,
        ]),
        sql`, `,
      )}
        FROM ${exportT}
       WHERE ${LIVE}`),
  );

  // Road and rail as one pass: two UNIONed subqueries over the same table is
  // two scans for four numbers.
  const [vehicleRow] = rowsOf<Record<string, number>>(
    await db.execute(sql`
      SELECT count(*) FILTER (WHERE ${hasText(sql`${exportT.horse}`)})::int AS road_count,
             count(DISTINCT ${exportT.horse})::int AS road_unique,
             COALESCE(SUM(${exportT.weight}) FILTER (WHERE ${hasText(sql`${exportT.horse}`)}), 0)::float AS road_weight,
             count(*) FILTER (WHERE ${hasText(sql`${exportT.wagonRef}`)})::int AS rail_count,
             count(DISTINCT ${exportT.wagonRef})::int AS rail_unique,
             COALESCE(SUM(${exportT.weight}) FILTER (WHERE ${hasText(sql`${exportT.wagonRef}`)}), 0)::float AS rail_weight
        FROM ${exportT}
       WHERE ${LIVE}`),
  );

  const monthly = rowsOf<ExportLogistics['monthly'][number]>(
    await db.execute(sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', current_date) - interval '11 months',
          date_trunc('month', current_date),
          interval '1 month'
        ) AS m
      )
      SELECT to_char(months.m, 'Mon') AS month_short,
             (SELECT count(*) FROM ${exportT}
               WHERE ${LIVE} AND date_trunc('month', ${exportT.createdAt}) = months.m
                 AND ${filled('border_arrival_date')})::int AS border_arrivals,
             (SELECT count(*) FROM ${exportT}
               WHERE ${LIVE} AND date_trunc('month', ${exportT.createdAt}) = months.m
                 AND ${filled('exit_drc_date')})::int AS drc_exits
        FROM months
       ORDER BY months.m`),
  );

  const [containerTypes, truckStatus] = await Promise.all([
    distribution('feet_container_master_t', 'feet_container_size', sql`${exportT.feetContainer}`),
    distribution('truck_status_master_t', 'truck_status', sql`${exportT.truckStatus}`),
  ]);

  const transit = await spans(EXPORT_TRANSIT_SPANS);

  return {
    overview: {
      loaded: row?.loaded ?? 0,
      kanyaka_arrivals: row?.kanyaka_arrivals ?? 0,
      border_arrivals: row?.border_arrivals ?? 0,
      drc_exits: row?.drc_exits ?? 0,
      road_shipments: row?.road_shipments ?? 0,
      rail_shipments: row?.rail_shipments ?? 0,
      container_shipments: row?.container_shipments ?? 0,
      total_weight: row?.total_weight ?? 0,
      total_seals: row?.total_seals ?? 0,
    },
    stages: EXPORT_MILESTONES.map((m) => ({ key: m.key, label: m.label, count: row?.[m.key] ?? 0 })),
    completed: row?.completed ?? 0,
    transit,
    processing: EXPORT_PROCESSING_SPANS.map((s) => ({
      key: s.key,
      label: s.label,
      days: round1(procRow?.[`${s.key}_days`]),
      processed: Number(procRow?.[`${s.key}_count`] ?? 0),
    })),
    vehicles: [
      {
        label: 'Road (Horse/Trailer)',
        shipments: vehicleRow?.road_count ?? 0,
        unique: vehicleRow?.road_unique ?? 0,
        weight: vehicleRow?.road_weight ?? 0,
      },
      {
        label: 'Rail (Wagon)',
        shipments: vehicleRow?.rail_count ?? 0,
        unique: vehicleRow?.rail_unique ?? 0,
        weight: vehicleRow?.rail_weight ?? 0,
      },
    ],
    container_types: containerTypes,
    truck_status: truckStatus,
    monthly,
  };
}

// ===================================================================
// Tri Phase
// ===================================================================

export interface ExportTriPhase {
  month_label: string;
  total: number;
  phase1: number;
  phase2: number;
  phase3: number;
  monthly: Array<{ month_short: string; phase1: number; phase2: number; phase3: number }>;
  by_client: Array<{ client_name: string | null; total: number; phase1: number; phase2: number; phase3: number }>;
}

const PHASES = [
  { key: 'phase1', from: 1, to: 10 },
  { key: 'phase2', from: 11, to: 20 },
  { key: 'phase3', from: 21, to: 31 },
] as const;

export async function getExportTriPhase(): Promise<ExportTriPhase> {
  const day = sql`EXTRACT(DAY FROM ${exportT.createdAt})`;
  const phaseCounts = (): SQL[] =>
    PHASES.map(
      (p) =>
        sql`count(*) FILTER (WHERE ${day} BETWEEN ${p.from} AND ${p.to})::int AS ${sql.identifier(p.key)}`,
    );
  const thisMonth = sql`date_trunc('month', ${exportT.createdAt}) = date_trunc('month', current_date)`;

  const [overview] = rowsOf<Record<string, number | string>>(
    await db.execute(sql`
      SELECT to_char(current_date, 'Mon YYYY') AS month_label,
             count(*)::int AS total,
             ${sql.join(phaseCounts(), sql`, `)}
        FROM ${exportT}
       WHERE ${LIVE} AND ${thisMonth}`),
  );

  const monthly = rowsOf<ExportTriPhase['monthly'][number]>(
    await db.execute(sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', current_date) - interval '11 months',
          date_trunc('month', current_date),
          interval '1 month'
        ) AS m
      )
      SELECT to_char(months.m, 'Mon') AS month_short,
             ${sql.join(
               PHASES.map(
                 (p) => sql`(SELECT count(*) FROM ${exportT}
                   WHERE ${LIVE} AND date_trunc('month', ${exportT.createdAt}) = months.m
                     AND ${day} BETWEEN ${p.from} AND ${p.to})::int AS ${sql.identifier(p.key)}`,
               ),
               sql`, `,
             )}
        FROM months
       ORDER BY months.m`),
  );

  // Three months, not one: a single month's split is too small to read a
  // pattern from, and the by-client table is where a pattern would show.
  const byClient = rowsOf<ExportTriPhase['by_client'][number]>(
    await db.execute(sql`
      SELECT c.short_name AS client_name,
             count(*)::int AS total,
             ${sql.join(phaseCounts(), sql`, `)}
        FROM ${exportT}
        LEFT JOIN client_master_t c ON c.id = ${exportT.clientId}
       WHERE ${LIVE} AND ${exportT.createdAt} >= current_date - interval '3 months'
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
    monthly,
    by_client: byClient,
  };
}

// ===================================================================
// Prepayment
// ===================================================================

export interface AgencyFeeRow {
  key: string;
  label: string;
  total: number;
  processed: number;
  avg: number | null;
  max: number | null;
  min: number | null;
}

export interface ExportPrepayment {
  totals: Record<string, number> & { agency_fees: number; liquidation: number };
  agencies: AgencyFeeRow[];
  liquidation: { count: number; with_reference: number; avg_days_to_liquidation: number | null };
  quittance: { count: number; with_reference: number; avg_days_from_liquidation: number | null };
  monthly: Array<{ month_short: string } & Record<string, number>>;
  files: Array<{
    id: number;
    mca_ref: string | null;
    client_name: string | null;
    weight: number | null;
    ceec: number;
    cgea: number;
    occ: number;
    lmc: number;
    lmc_id: string | null;
    lmc_date: string | null;
    ogefrem: number;
    ogefrem_ref: string | null;
    ogefrem_date: string | null;
    total_fees: number;
    liquidation: number;
  }>;
}

/** The five agency amounts added together — the figure every panel calls total fees. */
const AGENCY_TOTAL: SQL = sql.join(
  EXPORT_AGENCIES.map((a) => sql`COALESCE(${col(a.amount)}, 0)`),
  sql` + `,
);

export async function getExportPrepayment(): Promise<ExportPrepayment> {
  const [totalsRow] = rowsOf<Record<string, number>>(
    await db.execute(sql`
      SELECT ${sql.join(
        [
          ...EXPORT_AGENCIES.map(
            (a) => sql`COALESCE(SUM(${col(a.amount)}), 0)::float AS ${sql.identifier(a.key)}`,
          ),
          sql`COALESCE(SUM(${AGENCY_TOTAL}), 0)::float AS agency_fees`,
          sql`COALESCE(SUM(${exportT.liquidationAmount}), 0)::float AS liquidation`,
        ],
        sql`, `,
      )}
        FROM ${exportT}
       WHERE ${LIVE}`),
  );

  // Every agency's five figures in one pass, generated from the list.
  const [agencyRow] = rowsOf<Record<string, number | null>>(
    await db.execute(sql`
      SELECT ${sql.join(
        EXPORT_AGENCIES.flatMap((a) => {
          const paid = sql`${col(a.amount)} > 0`;
          return [
            sql`COALESCE(SUM(${col(a.amount)}) FILTER (WHERE ${paid}), 0)::float AS ${sql.identifier(`${a.key}_total`)}`,
            sql`count(*) FILTER (WHERE ${paid})::int AS ${sql.identifier(`${a.key}_count`)}`,
            sql`AVG(${col(a.amount)}) FILTER (WHERE ${paid})::float AS ${sql.identifier(`${a.key}_avg`)}`,
            sql`MAX(${col(a.amount)}) FILTER (WHERE ${paid})::float AS ${sql.identifier(`${a.key}_max`)}`,
            sql`MIN(${col(a.amount)}) FILTER (WHERE ${paid})::float AS ${sql.identifier(`${a.key}_min`)}`,
          ];
        }),
        sql`, `,
      )}
        FROM ${exportT}
       WHERE ${LIVE}`),
  );

  const [settle] = rowsOf<{
    liq_count: number;
    liq_ref: number;
    liq_days: number | null;
    qui_count: number;
    qui_ref: number;
    qui_days: number | null;
  }>(
    await db.execute(sql`
      SELECT count(*) FILTER (WHERE ${filled('liquidation_date')})::int AS liq_count,
             count(*) FILTER (
               WHERE ${exportT.liquidationReference} IS NOT NULL AND ${exportT.liquidationReference} <> ''
             )::int AS liq_ref,
             ${avgDays('dgda_out_date', 'liquidation_date')} AS liq_days,
             count(*) FILTER (WHERE ${filled('quittance_date')})::int AS qui_count,
             count(*) FILTER (
               WHERE ${exportT.quittanceReference} IS NOT NULL AND ${exportT.quittanceReference} <> ''
             )::int AS qui_ref,
             ${avgDays('liquidation_date', 'quittance_date')} AS qui_days
        FROM ${exportT}
       WHERE ${LIVE}`),
  );

  const monthly = rowsOf<ExportPrepayment['monthly'][number]>(
    await db.execute(sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', current_date) - interval '11 months',
          date_trunc('month', current_date),
          interval '1 month'
        ) AS m
      )
      SELECT to_char(months.m, 'Mon') AS month_short,
             ${sql.join(
               [
                 ...EXPORT_AGENCIES.map(
                   (a) => sql`(SELECT COALESCE(SUM(${col(a.amount)}), 0) FROM ${exportT}
                     WHERE ${LIVE} AND date_trunc('month', ${exportT.createdAt}) = months.m)::float
                     AS ${sql.identifier(a.key)}`,
                 ),
                 sql`(SELECT COALESCE(SUM(${exportT.liquidationAmount}), 0) FROM ${exportT}
                   WHERE ${LIVE} AND date_trunc('month', ${exportT.createdAt}) = months.m)::float
                   AS liquidation`,
               ],
               sql`, `,
             )}
        FROM months
       ORDER BY months.m`),
  );

  const files = rowsOf<ExportPrepayment['files'][number]>(
    await db.execute(sql`
      SELECT ${exportT.id} AS id,
             ${exportT.mcaRef} AS mca_ref,
             c.short_name AS client_name,
             ${exportT.weight}::float AS weight,
             COALESCE(${exportT.ceecAmount}, 0)::float AS ceec,
             COALESCE(${exportT.cgeaAmount}, 0)::float AS cgea,
             COALESCE(${exportT.occAmount}, 0)::float AS occ,
             COALESCE(${exportT.lmcAmount}, 0)::float AS lmc,
             ${exportT.lmcId} AS lmc_id,
             ${exportT.lmcDate} AS lmc_date,
             COALESCE(${exportT.ogefremAmount}, 0)::float AS ogefrem,
             ${exportT.ogefremInvRef} AS ogefrem_ref,
             ${exportT.ogefremDate} AS ogefrem_date,
             (${AGENCY_TOTAL})::float AS total_fees,
             COALESCE(${exportT.liquidationAmount}, 0)::float AS liquidation
        FROM ${exportT}
        LEFT JOIN client_master_t c ON c.id = ${exportT.clientId}
       WHERE ${LIVE}
       ORDER BY (${AGENCY_TOTAL}) DESC
       LIMIT 500`),
  );

  const totals: ExportPrepayment['totals'] = {
    agency_fees: totalsRow?.agency_fees ?? 0,
    liquidation: totalsRow?.liquidation ?? 0,
  };
  for (const a of EXPORT_AGENCIES) totals[a.key] = totalsRow?.[a.key] ?? 0;

  return {
    totals,
    agencies: EXPORT_AGENCIES.map((a) => ({
      key: a.key,
      label: a.label,
      total: Number(agencyRow?.[`${a.key}_total`] ?? 0),
      processed: Number(agencyRow?.[`${a.key}_count`] ?? 0),
      avg: round1(agencyRow?.[`${a.key}_avg`]),
      max: round1(agencyRow?.[`${a.key}_max`]),
      min: round1(agencyRow?.[`${a.key}_min`]),
    })),
    liquidation: {
      count: settle?.liq_count ?? 0,
      with_reference: settle?.liq_ref ?? 0,
      avg_days_to_liquidation: round1(settle?.liq_days),
    },
    quittance: {
      count: settle?.qui_count ?? 0,
      with_reference: settle?.qui_ref ?? 0,
      avg_days_from_liquidation: round1(settle?.qui_days),
    },
    monthly,
    files,
  };
}

// ===================================================================
// Report tab — the client list its filters offer
// ===================================================================

export async function getExportClientOptions(): Promise<Array<{ id: number; label: string }>> {
  return rowsOf<{ id: number; label: string }>(
    await db.execute(sql`
      SELECT c.id AS id, c.short_name AS label
        FROM client_master_t c
       WHERE c.display = 'Y'
         AND EXISTS (SELECT 1 FROM ${exportT} WHERE ${exportT.clientId} = c.id AND ${LIVE})
       ORDER BY c.id`),
  );
}

/** The filter clause shared by every export-dashboard spreadsheet. */
export function exportReportFilter(f: {
  client_id?: number | undefined;
  from?: string | undefined;
  to?: string | undefined;
  /** Which date column the range applies to. Defaults to the creation date. */
  field?: string | undefined;
}): SQL {
  const conds: SQL[] = [LIVE];
  if (f.client_id !== undefined) conds.push(sql`${exportT.clientId} = ${f.client_id}`);
  if (f.from || f.to) {
    // A range on a specific milestone only counts files that reached it, which
    // is what every report card means by its date filter.
    const target = f.field && f.field !== 'created_at' ? col(f.field) : sql`${exportT.createdAt}::date`;
    if (f.field && f.field !== 'created_at') conds.push(sql`${target} IS NOT NULL`);
    if (f.from) conds.push(sql`${target} >= ${f.from}`);
    if (f.to) conds.push(sql`${target} <= ${f.to}`);
  }
  return sql.join(conds, sql` AND `);
}
