// Local Tracking queries (§7.4). Scoped to main offices 1/2/4 like main. All
// list/stat/dashboard reads join the office + client masters for display names.
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';

// Offices this module surfaces (Lubumbashi / Kolwezi / Likasi).
const OFFICE_FILTER = sql`l.location IN (1, 2, 4)`;

function rows<T>(res: unknown): T[] {
  return (res as { rows: T[] }).rows;
}

// ---- list (server-side, joined, filtered) -----------------------------------

export interface LocalListRow {
  id: number;
  client_name: string | null;
  location_name: string | null;
  location_id: number | null;
  mca_lt_reference: string | null;
  lot_num: string | null;
  horse: string | null;
  transporter: string | null;
  arrival_date: string | null;
}

export async function listLocals(
  locationFilter: number,
  q: string | undefined,
  limit: number,
  offset: number,
): Promise<{ items: LocalListRow[]; total: number }> {
  const conds: SQL[] = [sql`l.display = 'Y'`, OFFICE_FILTER];
  if (locationFilter > 0) conds.push(sql`l.location = ${locationFilter}`);
  if (q?.trim()) {
    const like = `%${q.trim()}%`;
    conds.push(sql`(l.mca_lt_reference ILIKE ${like} OR l.lot_num ILIKE ${like} OR l.horse ILIKE ${like}
      OR l.trailer_1 ILIKE ${like} OR l.trailer_2 ILIKE ${like} OR l.transporter ILIKE ${like}
      OR c.short_name ILIKE ${like} OR m.main_location_name ILIKE ${like})`);
  }
  const where = sql.join([sql`WHERE `, sql.join(conds, sql` AND `)]);
  const joins = sql`FROM locals_t l
    LEFT JOIN client_master_t c ON c.id = l.client_id
    LEFT JOIN main_office_master_t m ON m.id = l.location`;

  const totalRes = await db.execute(sql`SELECT COUNT(*)::int AS total ${joins} ${where}`);
  const total = rows<{ total: number }>(totalRes)[0]?.total ?? 0;

  const dataRes = await db.execute(sql`
    SELECT l.id, l.mca_lt_reference, l.lot_num, l.horse, l.transporter, l.arrival_date,
           l.location AS location_id, c.short_name AS client_name, m.main_location_name AS location_name
    ${joins} ${where}
    ORDER BY l.id DESC LIMIT ${limit} OFFSET ${offset}
  `);
  return { items: rows<LocalListRow>(dataRes), total };
}

// ---- single detail -----------------------------------------------------------

export async function getLocalDetail(id: number): Promise<Record<string, unknown> | null> {
  const res = await db.execute(sql`
    SELECT l.*, l.location AS location_id, c.short_name AS client_name, m.main_location_name AS location_name
    FROM locals_t l
    LEFT JOIN client_master_t c ON c.id = l.client_id
    LEFT JOIN main_office_master_t m ON m.id = l.location
    WHERE l.id = ${id} AND l.display = 'Y' LIMIT 1
  `);
  return rows<Record<string, unknown>>(res)[0] ?? null;
}

// ---- statistics (list-page cards) -------------------------------------------

export interface LocalStatistics {
  total_tracking: number;
  location_counts: Array<{ id: number; main_location_name: string; file_count: number }>;
}

export async function getLocalStatistics(): Promise<LocalStatistics> {
  const totalRes = await db.execute(sql`
    SELECT COUNT(*)::int AS total FROM locals_t l WHERE l.display = 'Y' AND ${OFFICE_FILTER}
  `);
  const total = rows<{ total: number }>(totalRes)[0]?.total ?? 0;

  const locRes = await db.execute(sql`
    SELECT m.id, m.main_location_name, COUNT(l.id)::int AS file_count
    FROM main_office_master_t m
    LEFT JOIN locals_t l ON m.id = l.location AND l.display = 'Y'
    WHERE m.display = 'Y' AND m.id IN (1, 2, 4)
    GROUP BY m.id, m.main_location_name
    ORDER BY m.id ASC
  `);
  return { total_tracking: total, location_counts: rows(locRes) };
}

// ---- dashboard aggregates ----------------------------------------------------

export interface LocalDashboard {
  kpi: {
    total_files: number; today_files: number; week_files: number; month_files: number;
    year_files: number; avg_ceec_days: number; total_weight: number; total_bags: number;
  };
  top_locations: Array<{ location_name: string; file_count: number }>;
  location_distribution: Array<{ location_name: string; tracking_count: number; total_weight: number; total_bags: number }>;
  client_type_distribution: Array<{ client_category: string; tracking_count: number }>;
  monthly_trend: Array<{ month_name: string; tracking_count: number; total_weight: number }>;
  horse_performance: Array<{ horse_name: string; trip_count: number; total_weight: number }>;
  trailer_performance: Array<{ trailer_name: string; trip_count: number; total_weight: number }>;
  top_clients: Array<{ company_name: string; short_name: string; tracking_count: number; total_weight: number }>;
  recent_trackings: Array<Record<string, unknown>>;
}

export async function getLocalDashboard(): Promise<LocalDashboard> {
  const base = sql`FROM locals_t l WHERE l.display = 'Y' AND ${OFFICE_FILTER}`;

  const kpiRes = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_files,
      SUM(CASE WHEN l.created_at::date = current_date THEN 1 ELSE 0 END)::int AS today_files,
      SUM(CASE WHEN date_trunc('week', l.created_at) = date_trunc('week', current_date) THEN 1 ELSE 0 END)::int AS week_files,
      SUM(CASE WHEN date_trunc('month', l.created_at) = date_trunc('month', current_date) THEN 1 ELSE 0 END)::int AS month_files,
      SUM(CASE WHEN date_trunc('year', l.created_at) = date_trunc('year', current_date) THEN 1 ELSE 0 END)::int AS year_files,
      COALESCE(AVG(CASE WHEN l.ceec_in IS NOT NULL AND l.ceec_out IS NOT NULL THEN (l.ceec_out - l.ceec_in) END), 0)::float AS avg_ceec_days,
      COALESCE(SUM(l.weight), 0)::float AS total_weight,
      COALESCE(SUM(l.nbr_of_bags), 0)::int AS total_bags
    ${base}
  `);
  const kpi = rows<LocalDashboard['kpi']>(kpiRes)[0];

  const locDist = await db.execute(sql`
    SELECT COALESCE(m.main_location_name, 'Not Specified') AS location_name,
           COUNT(l.id)::int AS tracking_count,
           COALESCE(SUM(l.weight),0)::float AS total_weight, COALESCE(SUM(l.nbr_of_bags),0)::int AS total_bags
    FROM locals_t l LEFT JOIN main_office_master_t m ON m.id = l.location
    WHERE l.display = 'Y' AND ${OFFICE_FILTER}
    GROUP BY m.main_location_name ORDER BY tracking_count DESC LIMIT 10
  `);
  const location_distribution = rows<LocalDashboard['location_distribution'][number]>(locDist);

  const clientType = await db.execute(sql`
    SELECT CASE
      WHEN c.client_type LIKE '%I%' AND c.client_type LIKE '%E%' AND c.client_type LIKE '%L%' THEN 'Import+Export+Local'
      WHEN c.client_type LIKE '%I%' AND c.client_type LIKE '%E%' THEN 'Import+Export'
      WHEN c.client_type LIKE '%I%' AND c.client_type LIKE '%L%' THEN 'Import+Local'
      WHEN c.client_type LIKE '%E%' AND c.client_type LIKE '%L%' THEN 'Export+Local'
      WHEN c.client_type = 'I' THEN 'Import Only'
      WHEN c.client_type = 'E' THEN 'Export Only'
      WHEN c.client_type = 'L' THEN 'Local Only'
      ELSE 'Other' END AS client_category,
      COUNT(l.id)::int AS tracking_count
    FROM locals_t l INNER JOIN client_master_t c ON l.client_id = c.id
    WHERE l.display = 'Y' AND c.display = 'Y' AND ${OFFICE_FILTER}
    GROUP BY client_category ORDER BY tracking_count DESC
  `);

  const monthly = await db.execute(sql`
    SELECT to_char(date_trunc('month', l.created_at), 'Mon YYYY') AS month_name,
           COUNT(l.id)::int AS tracking_count, COALESCE(SUM(l.weight),0)::float AS total_weight
    FROM locals_t l
    WHERE l.created_at >= current_date - interval '12 months' AND l.display = 'Y' AND ${OFFICE_FILTER}
    GROUP BY date_trunc('month', l.created_at) ORDER BY date_trunc('month', l.created_at) ASC
  `);

  const horse = await db.execute(sql`
    SELECT COALESCE(l.horse,'Not Specified') AS horse_name, COUNT(l.id)::int AS trip_count, COALESCE(SUM(l.weight),0)::float AS total_weight
    FROM locals_t l WHERE l.display='Y' AND l.horse IS NOT NULL AND l.horse <> '' AND ${OFFICE_FILTER}
    GROUP BY l.horse ORDER BY trip_count DESC LIMIT 10
  `);

  const trailer = await db.execute(sql`
    SELECT COALESCE(l.trailer_1,'Not Specified') AS trailer_name, COUNT(l.id)::int AS trip_count, COALESCE(SUM(l.weight),0)::float AS total_weight
    FROM locals_t l WHERE l.display='Y' AND l.trailer_1 IS NOT NULL AND l.trailer_1 <> '' AND ${OFFICE_FILTER}
    GROUP BY l.trailer_1 ORDER BY trip_count DESC LIMIT 10
  `);

  const topClients = await db.execute(sql`
    SELECT c.company_name, c.short_name, COUNT(l.id)::int AS tracking_count, COALESCE(SUM(l.weight),0)::float AS total_weight
    FROM client_master_t c INNER JOIN locals_t l ON c.id = l.client_id
    WHERE l.display='Y' AND c.display='Y' AND ${OFFICE_FILTER}
    GROUP BY c.id, c.company_name, c.short_name ORDER BY tracking_count DESC LIMIT 10
  `);

  const recent = await db.execute(sql`
    SELECT l.id, l.mca_lt_reference, m.main_location_name AS location_name, l.horse, l.trailer_1,
           l.weight, l.nbr_of_bags, l.ceec_in, l.ceec_out,
           CASE WHEN l.ceec_in IS NOT NULL AND l.ceec_out IS NOT NULL THEN (l.ceec_out - l.ceec_in) ELSE NULL END AS ceec_duration_days,
           l.created_at, c.short_name
    FROM locals_t l LEFT JOIN client_master_t c ON c.id = l.client_id
    LEFT JOIN main_office_master_t m ON m.id = l.location
    WHERE l.display='Y' AND ${OFFICE_FILTER}
    ORDER BY l.created_at DESC LIMIT 20
  `);

  return {
    kpi: kpi ?? { total_files: 0, today_files: 0, week_files: 0, month_files: 0, year_files: 0, avg_ceec_days: 0, total_weight: 0, total_bags: 0 },
    top_locations: location_distribution.slice(0, 3).map((l) => ({ location_name: l.location_name, file_count: l.tracking_count })),
    location_distribution,
    client_type_distribution: rows(clientType),
    monthly_trend: rows(monthly),
    horse_performance: rows(horse),
    trailer_performance: rows(trailer),
    top_clients: rows(topClients),
    recent_trackings: rows(recent),
  };
}
