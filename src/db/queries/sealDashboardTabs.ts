import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT, mainOfficeMaster, sealBatch, sealNumber } from '@/db/schema';
import { SEAL_LOW_STOCK_THRESHOLD } from '@/lib/seals';
import { sealEntries } from './sealUsage';
import type { SealDashboardTab } from '@/schemas/seal-dashboard';

// §4.29 — the data behind the Seal Tracker dashboard.
//
// Three sources, each written once as a CTE and read by every aggregate:
//
//   ls — the live seal register: seal_number_t rows whose own row AND whose
//        batch are `display = 'Y'`. That is exactly the rule /api/v1/seals/stats
//        counts by, so a card here and the card on the Seals list agree.
//   lb — the live batches, with the office named as the Seals list names it
//        (main_office_master_t.main_location_name).
//   fs — one row per seal per live export file, split from the comma-joined
//        `exports_t.dgda_seal_no` by `sealEntries` — whole entries, never a
//        substring (§4.37).
//
// Same rules as the other dashboards: every figure is a SQL aggregate over live
// rows (§4.27), and money is summed as `numeric` and cast to float at the edge.

function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

const LIVE_SEALS: SQL = sql`
  SELECT sn.id, sn.seal_number, sn.status, sn.notes, sn.updated_at,
         b.id AS batch_id, b.purchase_date,
         b.office_location_id AS office_id,
         COALESCE(o.main_location_name, 'No office') AS office_name
    FROM ${sealNumber} sn
    JOIN ${sealBatch} b ON b.id = sn.seal_batch_id
    LEFT JOIN ${mainOfficeMaster} o ON o.id = b.office_location_id
   WHERE sn.display = 'Y' AND b.display = 'Y'`;

const LIVE_BATCHES: SQL = sql`
  SELECT b.id, b.purchase_date, b.sub_office_code,
         b.office_location_id AS office_id,
         COALESCE(o.main_location_name, 'No office') AS office_name,
         b.total_amount::numeric AS spend,
         b.total_seal
    FROM ${sealBatch} b
    LEFT JOIN ${mainOfficeMaster} o ON o.id = b.office_location_id
   WHERE b.display = 'Y'`;

/**
 * A seal is "used" on the date of the export file that carries it.
 *
 * `loading_date` is the date the seals are physically applied — the truck is
 * sealed when it is loaded — and it is the anchor the Export dashboard counts
 * files by (exportDashboard.ts), so the two dashboards put a file in the same
 * month. A file not yet loaded falls back to the day it was opened, rather than
 * dropping out of the monthly chart while it already names its seals.
 */
const FILE_SEALS: SQL = sql`
  SELECT e.id AS export_id, e.mca_ref, e.client_id, e.number_of_seals,
         COALESCE(e.loading_date, e.created_at::date) AS used_on,
         x.seal_no
    FROM ${exportT} e
   CROSS JOIN LATERAL (${sealEntries(sql`e.dgda_seal_no`)}) x
   WHERE e.display = 'Y' AND e.dgda_seal_no IS NOT NULL`;

/** The last twelve calendar months, oldest first, including the current one. */
const MONTHS: SQL = sql`
  SELECT generate_series(
           date_trunc('month', current_date) - interval '11 months',
           date_trunc('month', current_date),
           interval '1 month')::date AS m`;

export type SealStatus = 'Available' | 'Used' | 'Damaged';

// ─────────────────────────────────────────────────────────────────────────────
// Stock
// ─────────────────────────────────────────────────────────────────────────────

export interface SealKpi {
  /** SUM(total_seal) over live batches — the Seals list's "Total Seals". */
  purchased: number;
  /** Seal numbers entered in the register — the Seals list's "Added". */
  registered: number;
  available: number;
  used: number;
  damaged: number;
  batches: number;
  spend_usd: number;
  avg_cost_per_seal: number;
}

export interface OfficeStock {
  office_id: number | null;
  office_name: string;
  batches: number;
  purchased: number;
  registered: number;
  available: number;
  used: number;
  damaged: number;
  spend_usd: number;
  low_stock: boolean;
}

export interface StockMonth {
  month_short: string;
  purchased: number;
  used: number;
}

export interface SealRow {
  id: number;
  seal_number: string;
  status: SealStatus;
  office_name: string;
  batch_id: number;
  purchase_date: string | null;
  updated_on: string | null;
  notes: string | null;
  /** file references of the live export files naming this seal. */
  files: string;
  file_count: number;
}

export interface SealStock {
  kpi: SealKpi;
  offices: OfficeStock[];
  monthly: StockMonth[];
  seals: SealRow[];
  low_stock_threshold: number;
}

export async function getSealKpi(): Promise<SealKpi> {
  const res = await db.execute(sql`
    WITH ls AS (${LIVE_SEALS}), lb AS (${LIVE_BATCHES})
    SELECT (SELECT COALESCE(SUM(lb.total_seal), 0) FROM lb)::int AS purchased,
           count(*)::int AS registered,
           count(*) FILTER (WHERE ls.status = 'Available')::int AS available,
           count(*) FILTER (WHERE ls.status = 'Used')::int AS used,
           count(*) FILTER (WHERE ls.status = 'Damaged')::int AS damaged,
           (SELECT count(*) FROM lb)::int AS batches,
           (SELECT COALESCE(SUM(lb.spend), 0) FROM lb)::float AS spend_usd,
           (SELECT CASE WHEN SUM(lb.total_seal) > 0 THEN SUM(lb.spend) / SUM(lb.total_seal) ELSE 0 END
              FROM lb)::float AS avg_cost_per_seal
      FROM ls`);
  return rowsOf<SealKpi>(res)[0];
}

/**
 * Stock per office. Every office that has ever bought a batch appears, even
 * with nothing left — an office that has run dry is the one most in need of
 * the low-stock warning. Offices that have never bought seals are left out:
 * they do not stock seals, so "zero available" there is not a shortage.
 */
export async function getOfficeStock(): Promise<OfficeStock[]> {
  const res = await db.execute(sql`
    WITH ls AS (${LIVE_SEALS}), lb AS (${LIVE_BATCHES}),
         bo AS (
           SELECT lb.office_id, max(lb.office_name) AS office_name, count(*) AS batches,
                  SUM(lb.total_seal) AS purchased, SUM(lb.spend) AS spend
             FROM lb GROUP BY lb.office_id),
         so AS (
           SELECT ls.office_id, count(*) AS registered,
                  count(*) FILTER (WHERE ls.status = 'Available') AS available,
                  count(*) FILTER (WHERE ls.status = 'Used') AS used,
                  count(*) FILTER (WHERE ls.status = 'Damaged') AS damaged
             FROM ls GROUP BY ls.office_id)
    SELECT bo.office_id, bo.office_name,
           bo.batches::int AS batches,
           COALESCE(bo.purchased, 0)::int AS purchased,
           COALESCE(so.registered, 0)::int AS registered,
           COALESCE(so.available, 0)::int AS available,
           COALESCE(so.used, 0)::int AS used,
           COALESCE(so.damaged, 0)::int AS damaged,
           COALESCE(bo.spend, 0)::float AS spend_usd,
           (COALESCE(so.available, 0) < ${SEAL_LOW_STOCK_THRESHOLD}) AS low_stock
      FROM bo
      LEFT JOIN so ON so.office_id IS NOT DISTINCT FROM bo.office_id
     ORDER BY bo.office_name`);
  return rowsOf<OfficeStock>(res);
}

/** Seals bought (by batch purchase date) against seals put on files (by file date). */
export async function getStockMonthly(): Promise<StockMonth[]> {
  const res = await db.execute(sql`
    WITH lb AS (${LIVE_BATCHES}), fs AS (${FILE_SEALS}), months AS (${MONTHS})
    SELECT to_char(months.m, 'Mon YY') AS month_short,
           (SELECT COALESCE(SUM(lb.total_seal), 0) FROM lb
             WHERE date_trunc('month', lb.purchase_date) = months.m)::int AS purchased,
           (SELECT count(*) FROM fs
             WHERE date_trunc('month', fs.used_on) = months.m)::int AS used
      FROM months
     ORDER BY months.m`);
  return rowsOf<StockMonth>(res);
}

/** Every live seal, newest first, with the files that name it. */
export async function getSealRows(): Promise<SealRow[]> {
  const res = await db.execute(sql`
    WITH ls AS (${LIVE_SEALS}), fs AS (${FILE_SEALS})
    SELECT ls.id, ls.seal_number, ls.status, ls.office_name, ls.batch_id, ls.notes,
           to_char(ls.purchase_date, 'YYYY-MM-DD') AS purchase_date,
           to_char(ls.updated_at, 'YYYY-MM-DD') AS updated_on,
           COALESCE(f.files, '') AS files,
           COALESCE(f.file_count, 0)::int AS file_count
      FROM ls
      LEFT JOIN LATERAL (
        SELECT string_agg(COALESCE(fs.mca_ref, 'export #' || fs.export_id), ', ' ORDER BY fs.mca_ref) AS files,
               count(*) AS file_count
          FROM fs WHERE fs.seal_no = ls.seal_number
      ) f ON true
     ORDER BY ls.id DESC`);
  return rowsOf<SealRow>(res);
}

export async function getSealStock(): Promise<SealStock> {
  const [kpi, offices, monthly, seals] = await Promise.all([
    getSealKpi(),
    getOfficeStock(),
    getStockMonthly(),
    getSealRows(),
  ]);
  return { kpi, offices, monthly, seals, low_stock_threshold: SEAL_LOW_STOCK_THRESHOLD };
}

// ─────────────────────────────────────────────────────────────────────────────
// Batches
// ─────────────────────────────────────────────────────────────────────────────

export interface BatchRow {
  id: number;
  purchase_date: string | null;
  office_name: string;
  sub_office_code: string | null;
  total_seal: number;
  total_amount: number;
  cost_per_seal: number;
  registered: number;
  available: number;
  used: number;
  damaged: number;
  /** Used as a share of the seals registered under the batch. */
  used_pct: number;
}

export interface SealBatches {
  kpi: SealKpi;
  batches: BatchRow[];
  offices: OfficeStock[];
}

/**
 * Every live batch, newest purchase first.
 *
 * % used is out of the seals REGISTERED under the batch, not `total_seal`: the
 * Available / Used / Damaged counts beside it add up to the registered count,
 * so the percentage reads against the same whole. A batch whose numbers are not
 * all entered yet shows the gap as Registered < Total Seals.
 */
export async function getBatchRows(): Promise<BatchRow[]> {
  const res = await db.execute(sql`
    WITH ls AS (${LIVE_SEALS}), lb AS (${LIVE_BATCHES})
    SELECT lb.id,
           to_char(lb.purchase_date, 'YYYY-MM-DD') AS purchase_date,
           lb.office_name, lb.sub_office_code,
           lb.total_seal::int AS total_seal,
           lb.spend::float AS total_amount,
           (CASE WHEN lb.total_seal > 0 THEN lb.spend / lb.total_seal ELSE 0 END)::float AS cost_per_seal,
           count(ls.id)::int AS registered,
           count(ls.id) FILTER (WHERE ls.status = 'Available')::int AS available,
           count(ls.id) FILTER (WHERE ls.status = 'Used')::int AS used,
           count(ls.id) FILTER (WHERE ls.status = 'Damaged')::int AS damaged,
           (CASE WHEN count(ls.id) > 0
                 THEN count(ls.id) FILTER (WHERE ls.status = 'Used') * 100.0 / count(ls.id)
                 ELSE 0 END)::float AS used_pct
      FROM lb
      LEFT JOIN ls ON ls.batch_id = lb.id
     GROUP BY lb.id, lb.purchase_date, lb.office_name, lb.sub_office_code, lb.total_seal, lb.spend
     ORDER BY lb.purchase_date DESC NULLS LAST, lb.id DESC`);
  return rowsOf<BatchRow>(res);
}

export async function getSealBatches(): Promise<SealBatches> {
  const [kpi, batches, offices] = await Promise.all([getSealKpi(), getBatchRows(), getOfficeStock()]);
  return { kpi, batches, offices };
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage
// ─────────────────────────────────────────────────────────────────────────────

export interface UsageKpi {
  files_with_seals: number;
  /** Seal entries across all files — a seal on two files counts twice. */
  seal_entries: number;
  distinct_seals: number;
  clients: number;
  /** Seals named by more than one live export file. */
  shared_seals: number;
  /** Seal numbers on a file that are not in the live register. */
  unregistered: number;
  /** Register says Used, but no live file names the seal. */
  used_off_file: number;
  /** Register says Available, yet a live file names it — it could be issued twice. */
  available_on_file: number;
}

export interface UsageMonth {
  month_short: string;
  seals: number;
  files: number;
}

export interface FileRow {
  export_id: number;
  mca_ref: string | null;
  client_name: string | null;
  client_company: string | null;
  used_on: string | null;
  /** The file's own stored count, for comparison with what it lists. */
  number_of_seals: number | null;
  seal_count: number;
  seals: string;
  unregistered: number;
}

export interface ClientUsage {
  client_id: number | null;
  client_name: string | null;
  client_company: string | null;
  files: number;
  seals: number;
  last_date: string | null;
  share_pct: number;
}

export interface OfficeDamage {
  office_name: string;
  used: number;
  damaged: number;
  damaged_rate: number;
}

export interface DamageMonth {
  month_short: string;
  used: number;
  damaged: number;
  damaged_rate: number;
}

export interface SealUsage {
  kpi: UsageKpi;
  monthly: UsageMonth[];
  clients: ClientUsage[];
  files: FileRow[];
  office_damage: OfficeDamage[];
  damage_monthly: DamageMonth[];
}

export async function getUsageKpi(): Promise<UsageKpi> {
  const res = await db.execute(sql`
    WITH ls AS (${LIVE_SEALS}), fs AS (${FILE_SEALS}),
         ps AS (SELECT fs.seal_no, count(*) AS n FROM fs GROUP BY fs.seal_no)
    SELECT (SELECT count(DISTINCT fs.export_id) FROM fs)::int AS files_with_seals,
           (SELECT count(*) FROM fs)::int AS seal_entries,
           (SELECT count(*) FROM ps)::int AS distinct_seals,
           (SELECT count(DISTINCT fs.client_id) FROM fs)::int AS clients,
           (SELECT count(*) FROM ps WHERE ps.n > 1)::int AS shared_seals,
           (SELECT count(*) FROM ps
             WHERE NOT EXISTS (SELECT 1 FROM ls WHERE ls.seal_number = ps.seal_no))::int AS unregistered,
           (SELECT count(*) FROM ls
             WHERE ls.status = 'Used'
               AND NOT EXISTS (SELECT 1 FROM ps WHERE ps.seal_no = ls.seal_number))::int AS used_off_file,
           (SELECT count(*) FROM ls
             WHERE ls.status = 'Available'
               AND EXISTS (SELECT 1 FROM ps WHERE ps.seal_no = ls.seal_number))::int AS available_on_file`);
  return rowsOf<UsageKpi>(res)[0];
}

/** Every live export file naming at least one seal, most recent first. */
export async function getFileRows(): Promise<FileRow[]> {
  const res = await db.execute(sql`
    WITH ls AS (${LIVE_SEALS}), fs AS (${FILE_SEALS})
    SELECT fs.export_id, fs.mca_ref,
           c.short_name AS client_name, c.company_name AS client_company,
           to_char(fs.used_on, 'YYYY-MM-DD') AS used_on,
           fs.number_of_seals,
           count(*)::int AS seal_count,
           string_agg(fs.seal_no, ', ' ORDER BY fs.seal_no) AS seals,
           count(*) FILTER (
             WHERE NOT EXISTS (SELECT 1 FROM ls WHERE ls.seal_number = fs.seal_no))::int AS unregistered
      FROM fs
      LEFT JOIN client_master_t c ON c.id = fs.client_id
     GROUP BY fs.export_id, fs.mca_ref, c.short_name, c.company_name, fs.used_on, fs.number_of_seals
     ORDER BY fs.used_on DESC, fs.export_id DESC`);
  return rowsOf<FileRow>(res);
}

export async function getClientUsage(): Promise<ClientUsage[]> {
  const res = await db.execute(sql`
    WITH fs AS (${FILE_SEALS}),
         g AS (SELECT count(*) AS grand FROM fs)
    SELECT fs.client_id,
           max(c.short_name) AS client_name,
           max(c.company_name) AS client_company,
           count(DISTINCT fs.export_id)::int AS files,
           count(*)::int AS seals,
           to_char(max(fs.used_on), 'YYYY-MM-DD') AS last_date,
           CASE WHEN g.grand > 0 THEN (count(*) * 100.0 / g.grand)::float ELSE 0 END AS share_pct
      FROM fs CROSS JOIN g
      LEFT JOIN client_master_t c ON c.id = fs.client_id
     GROUP BY fs.client_id, g.grand
     ORDER BY seals DESC, files DESC`);
  return rowsOf<ClientUsage>(res);
}

/**
 * Damaged as a share of the seals that left the shelf (Used + Damaged), so an
 * office with a large unopened stock does not look careful by default.
 */
export async function getOfficeDamage(): Promise<OfficeDamage[]> {
  const res = await db.execute(sql`
    WITH ls AS (${LIVE_SEALS})
    SELECT ls.office_name,
           count(*) FILTER (WHERE ls.status = 'Used')::int AS used,
           count(*) FILTER (WHERE ls.status = 'Damaged')::int AS damaged,
           (CASE WHEN count(*) FILTER (WHERE ls.status IN ('Used', 'Damaged')) > 0
                 THEN count(*) FILTER (WHERE ls.status = 'Damaged') * 100.0
                      / count(*) FILTER (WHERE ls.status IN ('Used', 'Damaged'))
                 ELSE 0 END)::float AS damaged_rate
      FROM ls
     GROUP BY ls.office_name
     ORDER BY damaged_rate DESC, ls.office_name`);
  return rowsOf<OfficeDamage>(res);
}

/**
 * Damage by month. `seal_number_t` keeps no status-change date, so the month is
 * the seal row's `updated_at` — the last time it was changed, which for a seal
 * marked Used or Damaged is that change (neither status is edited further in
 * normal use). Used and Damaged are dated by the same clock, so the rate's
 * numerator and denominator agree on which month a seal belongs to.
 */
export async function getDamageMonthly(): Promise<DamageMonth[]> {
  const res = await db.execute(sql`
    WITH ls AS (${LIVE_SEALS}), months AS (${MONTHS})
    SELECT to_char(months.m, 'Mon YY') AS month_short,
           count(ls.id) FILTER (WHERE ls.status = 'Used')::int AS used,
           count(ls.id) FILTER (WHERE ls.status = 'Damaged')::int AS damaged,
           (CASE WHEN count(ls.id) > 0
                 THEN count(ls.id) FILTER (WHERE ls.status = 'Damaged') * 100.0 / count(ls.id)
                 ELSE 0 END)::float AS damaged_rate
      FROM months
      LEFT JOIN ls ON date_trunc('month', ls.updated_at) = months.m
                  AND ls.status IN ('Used', 'Damaged')
     GROUP BY months.m
     ORDER BY months.m`);
  return rowsOf<DamageMonth>(res);
}

export async function getUsageMonthly(): Promise<UsageMonth[]> {
  const res = await db.execute(sql`
    WITH fs AS (${FILE_SEALS}), months AS (${MONTHS})
    SELECT to_char(months.m, 'Mon YY') AS month_short,
           count(fs.seal_no)::int AS seals,
           count(DISTINCT fs.export_id)::int AS files
      FROM months
      LEFT JOIN fs ON date_trunc('month', fs.used_on) = months.m
     GROUP BY months.m
     ORDER BY months.m`);
  return rowsOf<UsageMonth>(res);
}

export async function getSealUsage(): Promise<SealUsage> {
  const [kpi, monthly, clients, files, office_damage, damage_monthly] = await Promise.all([
    getUsageKpi(),
    getUsageMonthly(),
    getClientUsage(),
    getFileRows(),
    getOfficeDamage(),
    getDamageMonthly(),
  ]);
  return { kpi, monthly, clients, files, office_damage, damage_monthly };
}

// ─────────────────────────────────────────────────────────────────────────────

/** One tab's data — the tab route's only call. */
export async function getSealDashboardTab(
  tab: SealDashboardTab,
): Promise<SealStock | SealBatches | SealUsage> {
  switch (tab) {
    case 'stock':
      return getSealStock();
    case 'batches':
      return getSealBatches();
    case 'usage':
      return getSealUsage();
  }
}
