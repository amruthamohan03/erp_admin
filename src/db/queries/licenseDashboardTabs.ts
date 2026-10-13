import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { licenseT } from '@/db/schema';
import { licenseUseForCondition, type LicenseUseFor } from './licenseFilters';

// §4.29 — the data behind the Licence dashboard's three tabs.
//
// Scoped by `useFor`, so the Import and Export Licence dashboards are the same
// aggregates over a different book rather than two implementations that will
// drift (§4.10) — the same arrangement the existing licence dashboard uses.
//
// Two rules hold throughout, and both are departures from the PHP this
// replaces rather than translations of it:
//
//  1. Every figure is a SQL aggregate over live rows, counted once. Main ran
//     eleven separate queries for the Overview tab, several of them scanning
//     the same table for a different CASE.
//  2. The expiry horizons are CUMULATIVE and said to be. "Expiring in 30 days"
//     includes the ones expiring in 7, because that is what an operator means
//     by it — and the screen says so rather than leaving them to find out by
//     adding the cards up and getting more than the total.

function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

/** Soft-deleted licences are out of every figure (§4.27). */
function scope(useFor?: LicenseUseFor): SQL {
  const live = sql`${licenseT.display} = 'Y'`;
  return useFor ? sql`${live} AND ${licenseUseForCondition(useFor)}` : live;
}

const expiry = sql`${licenseT.licenseExpiryDate}`;

/**
 * The date the period cards count on — the BUSINESS date the operator applied
 * for the licence, not the day the row was typed in.
 *
 * They disagree on four of five live rows, and the table's Applied column
 * shows this one. Counting on `created_at` would mean clicking "This Month"
 * produced rows whose Applied column reads some other month — the same defect
 * §4.15 and §4.19 exist to prevent, in the time dimension.
 */
const applied = sql`${licenseT.licenseAppliedDate}`;

/**
 * Lapsing inside N days — the horizons the cards offer.
 *
 * The interval is cast explicitly: as a bare bind parameter Postgres cannot
 * tell which `date + ?` operator is meant and refuses the whole statement.
 */
const within = (days: number): SQL =>
  sql`(${expiry} IS NOT NULL AND ${expiry} BETWEEN current_date AND current_date + ${days}::int)`;

/** One status's count, matched on the stored text rather than an id. */
const isStatus = (text: string): SQL => sql`upper(${licenseT.status}) = ${text}`;

export interface LicenseKpiRow {
  total: number;
  active: number;
  inactive: number;
  annulated: number;
  modified: number;
  prorogated: number;
  valid: number;
  expired: number;
  expiring_7: number;
  expiring_15: number;
  expiring_30: number;
  today: number;
  yesterday: number;
  this_week: number;
  this_month: number;
  last_month: number;
  this_year: number;
  unique_clients: number;
  unique_banks: number;
}

export interface DistributionRow {
  label: string;
  count: number;
}

/**
 * The flags each licence row carries so a KPI card can narrow the table.
 *
 * Computed in SQL and sent with the row, so clicking "Expiring in 15 Days"
 * filters on the same rule the card counted with. The PHP recomputed the
 * categories in a DataTables regex over hidden columns, which is how a card
 * and the rows it reveals come to disagree.
 */
export type ExpiryFlag = 'Expired' | 'Expiring7' | 'Expiring15' | 'Expiring30' | 'Valid';
export type PeriodFlag = 'TODAY' | 'THISWEEK' | 'THISMONTH' | 'THISYEAR' | 'OLDER';

export interface LicenseRow {
  id: number;
  license_number: string | null;
  invoice_number: string | null;
  client_name: string | null;
  bank_name: string | null;
  license_applied_date: string | null;
  license_expiry_date: string | null;
  status: string | null;
  expiry_flag: ExpiryFlag;
  period_flag: PeriodFlag;
  days_to_expiry: number | null;
}

export interface LicenseOverview {
  kpi: LicenseKpiRow;
  status: DistributionRow[];
  banks: DistributionRow[];
  goods: DistributionRow[];
  transport: DistributionRow[];
  currency: DistributionRow[];
  entry_post: DistributionRow[];
  monthly: Array<{ month: string; month_name: string; month_short: string; count: number }>;
  rows: LicenseRow[];
}

/** Files grouped by a referenced master's label. */
async function distribution(
  table: string,
  labelColumn: string,
  fk: SQL,
  base: SQL,
  limit?: number,
): Promise<DistributionRow[]> {
  return rowsOf<DistributionRow>(
    await db.execute(sql`
      SELECT COALESCE(m.${sql.identifier(labelColumn)}, 'Not Specified') AS label,
             count(*)::int AS count
        FROM ${licenseT}
        LEFT JOIN ${sql.identifier(table)} m ON m.id = ${fk} AND m.display = 'Y'
       WHERE ${base}
       GROUP BY COALESCE(m.${sql.identifier(labelColumn)}, 'Not Specified')
       ORDER BY count(*) DESC${limit ? sql` LIMIT ${limit}` : sql``}`),
  );
}

/**
 * The expiry band a licence falls in — disjoint, narrowest first.
 *
 * A licence is in exactly ONE band so the rows add up to the total. The cards
 * above them are cumulative, which is a different and deliberate reading: the
 * UI widens the filter to match each card.
 *
 * A licence with no expiry date has not lapsed, so it reads as Valid — in the
 * band AND in the figure the Valid card shows. Counting it in only one of the
 * two is how a card and the rows it reveals come apart.
 */
const EXPIRY_FLAG: SQL = sql`
  CASE
    WHEN ${expiry} IS NULL THEN 'Valid'
    WHEN ${expiry} < current_date THEN 'Expired'
    WHEN ${expiry} <= current_date + 7 THEN 'Expiring7'
    WHEN ${expiry} <= current_date + 15 THEN 'Expiring15'
    WHEN ${expiry} <= current_date + 30 THEN 'Expiring30'
    ELSE 'Valid'
  END`;

const PERIOD_FLAG: SQL = sql`
  CASE
    WHEN ${applied}::date = current_date THEN 'TODAY'
    WHEN date_trunc('week', ${applied}) = date_trunc('week', current_date) THEN 'THISWEEK'
    WHEN date_trunc('month', ${applied}) = date_trunc('month', current_date) THEN 'THISMONTH'
    WHEN date_trunc('year', ${applied}) = date_trunc('year', current_date) THEN 'THISYEAR'
    ELSE 'OLDER'
  END`;

export async function getLicenseOverview(useFor?: LicenseUseFor): Promise<LicenseOverview> {
  const base = scope(useFor);

  const [kpi] = rowsOf<LicenseKpiRow>(
    await db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE ${isStatus('ACTIVE')})::int AS active,
             count(*) FILTER (WHERE ${isStatus('INACTIVE')})::int AS inactive,
             count(*) FILTER (WHERE ${isStatus('ANNULATED')})::int AS annulated,
             count(*) FILTER (WHERE ${isStatus('MODIFIED')})::int AS modified,
             count(*) FILTER (WHERE ${isStatus('PROROGATED')})::int AS prorogated,
             count(*) FILTER (WHERE ${expiry} IS NULL OR ${expiry} >= current_date)::int AS valid,
             count(*) FILTER (WHERE ${expiry} IS NOT NULL AND ${expiry} < current_date)::int AS expired,
             count(*) FILTER (WHERE ${within(7)})::int AS expiring_7,
             count(*) FILTER (WHERE ${within(15)})::int AS expiring_15,
             count(*) FILTER (WHERE ${within(30)})::int AS expiring_30,
             count(*) FILTER (WHERE ${applied}::date = current_date)::int AS today,
             count(*) FILTER (WHERE ${applied}::date = current_date - 1)::int AS yesterday,
             count(*) FILTER (WHERE date_trunc('week', ${applied}) = date_trunc('week', current_date))::int AS this_week,
             count(*) FILTER (WHERE date_trunc('month', ${applied}) = date_trunc('month', current_date))::int AS this_month,
             count(*) FILTER (
               WHERE date_trunc('month', ${applied}) = date_trunc('month', current_date - interval '1 month')
             )::int AS last_month,
             count(*) FILTER (WHERE date_trunc('year', ${applied}) = date_trunc('year', current_date))::int AS this_year,
             count(DISTINCT ${licenseT.clientId})::int AS unique_clients,
             count(DISTINCT ${licenseT.bankId})::int AS unique_banks
        FROM ${licenseT}
       WHERE ${base}`),
  );

  // Every month in the window, including the quiet ones — a gap in a trend is
  // information, and a series that omits an empty month draws a straight line
  // through it.
  const monthly = rowsOf<LicenseOverview['monthly'][number]>(
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
             (SELECT count(*) FROM ${licenseT}
               WHERE ${base} AND date_trunc('month', ${applied}) = months.m)::int AS count
        FROM months
       ORDER BY months.m`),
  );

  // Grouped by the stored text so a status nobody has used yet simply does not
  // appear, and a new one appears the day it is used (§4.1).
  const status = rowsOf<DistributionRow>(
    await db.execute(sql`
      SELECT COALESCE(NULLIF(upper(${licenseT.status}), ''), 'Not Set') AS label,
             count(*)::int AS count
        FROM ${licenseT}
       WHERE ${base}
       GROUP BY COALESCE(NULLIF(upper(${licenseT.status}), ''), 'Not Set')
       ORDER BY count(*) DESC`),
  );

  const rows = rowsOf<LicenseRow>(
    await db.execute(sql`
      SELECT ${licenseT.id} AS id,
             ${licenseT.licenseNumber} AS license_number,
             ${licenseT.invoiceNumber} AS invoice_number,
             c.short_name AS client_name,
             b.bank_name AS bank_name,
             ${licenseT.licenseAppliedDate} AS license_applied_date,
             ${licenseT.licenseExpiryDate} AS license_expiry_date,
             upper(${licenseT.status}) AS status,
             ${EXPIRY_FLAG} AS expiry_flag,
             ${PERIOD_FLAG} AS period_flag,
             (${expiry} - current_date)::int AS days_to_expiry
        FROM ${licenseT}
        LEFT JOIN client_master_t c ON c.id = ${licenseT.clientId}
        LEFT JOIN banklist_master_t b ON b.id = ${licenseT.bankId}
       WHERE ${base}
       ORDER BY ${licenseT.createdAt} DESC
       LIMIT 5000`),
  );

  const [banks, goods, transport, currency, entryPost] = await Promise.all([
    distribution('banklist_master_t', 'bank_name', sql`${licenseT.bankId}`, base),
    distribution('type_of_goods_master_t', 'goods_type', sql`${licenseT.typeOfGoodsId}`, base, 10),
    distribution('transport_mode_master_t', 'transport_mode_name', sql`${licenseT.transportModeId}`, base),
    distribution('currency_master_t', 'currency_name', sql`${licenseT.currencyId}`, base),
    distribution('transit_point_master_t', 'transit_point_name', sql`${licenseT.entryPostId}`, base, 10),
  ]);

  return {
    kpi: kpi ?? {
      total: 0, active: 0, inactive: 0, annulated: 0, modified: 0, prorogated: 0,
      valid: 0, expired: 0, expiring_7: 0, expiring_15: 0, expiring_30: 0,
      today: 0, yesterday: 0, this_week: 0, this_month: 0, last_month: 0,
      this_year: 0, unique_clients: 0, unique_banks: 0,
    },
    status,
    banks,
    goods,
    transport,
    currency,
    entry_post: entryPost,
    monthly,
    rows,
  };
}

// ===================================================================
// Expiry
// ===================================================================

export interface LicenseExpiryRow extends LicenseRow {
  /** The band's human name, which the cards filter on. */
  expiry_category: string;
}

export interface LicenseExpiry {
  kpi: { valid: number; expiring_7: number; expiring_15: number; expiring_30: number; expired: number };
  rows: LicenseExpiryRow[];
}

export async function getLicenseExpiry(useFor?: LicenseUseFor): Promise<LicenseExpiry> {
  const base = scope(useFor);

  const [kpi] = rowsOf<LicenseExpiry['kpi']>(
    await db.execute(sql`
      SELECT count(*) FILTER (WHERE ${expiry} IS NULL OR ${expiry} >= current_date)::int AS valid,
             count(*) FILTER (WHERE ${within(7)})::int AS expiring_7,
             count(*) FILTER (WHERE ${within(15)})::int AS expiring_15,
             count(*) FILTER (WHERE ${within(30)})::int AS expiring_30,
             count(*) FILTER (WHERE ${expiry} IS NOT NULL AND ${expiry} < current_date)::int AS expired
        FROM ${licenseT}
       WHERE ${base}`),
  );

  const rows = rowsOf<LicenseExpiryRow>(
    await db.execute(sql`
      SELECT ${licenseT.id} AS id,
             ${licenseT.licenseNumber} AS license_number,
             ${licenseT.invoiceNumber} AS invoice_number,
             c.short_name AS client_name,
             b.bank_name AS bank_name,
             ${licenseT.licenseAppliedDate} AS license_applied_date,
             ${licenseT.licenseExpiryDate} AS license_expiry_date,
             upper(${licenseT.status}) AS status,
             ${EXPIRY_FLAG} AS expiry_flag,
             ${PERIOD_FLAG} AS period_flag,
             (${expiry} - current_date)::int AS days_to_expiry,
             CASE
               WHEN ${expiry} IS NULL THEN 'No Expiry Date'
               WHEN ${expiry} < current_date THEN 'Expired'
               WHEN ${expiry} <= current_date + 7 THEN 'Expiring in 7 Days'
               WHEN ${expiry} <= current_date + 15 THEN 'Expiring in 15 Days'
               WHEN ${expiry} <= current_date + 30 THEN 'Expiring in 30 Days'
               ELSE 'Valid'
             END AS expiry_category
        FROM ${licenseT}
        LEFT JOIN client_master_t c ON c.id = ${licenseT.clientId}
        LEFT JOIN banklist_master_t b ON b.id = ${licenseT.bankId}
       WHERE ${base}
       ORDER BY ${expiry} ASC NULLS LAST
       LIMIT 5000`),
  );

  return {
    kpi: kpi ?? { valid: 0, expiring_7: 0, expiring_15: 0, expiring_30: 0, expired: 0 },
    rows,
  };
}

// ===================================================================
// Clients
// ===================================================================

export interface LicenseClients {
  stats: { total_clients: number; active_clients: number; with_licenses: number; verified_clients: number };
  clients: Array<{
    id: number;
    short_name: string | null;
    company_name: string | null;
    total: number;
    active: number;
    success_rate: number;
  }>;
}

export async function getLicenseClients(useFor?: LicenseUseFor): Promise<LicenseClients> {
  const base = scope(useFor);

  const [stats] = rowsOf<LicenseClients['stats']>(
    await db.execute(sql`
      SELECT count(*)::int AS total_clients,
             count(*) FILTER (WHERE c.display = 'Y')::int AS active_clients,
             count(*) FILTER (WHERE c.verified_by_id IS NOT NULL)::int AS verified_clients,
             (SELECT count(DISTINCT ${licenseT.clientId}) FROM ${licenseT} WHERE ${base})::int AS with_licenses
        FROM client_master_t c`),
  );

  const clients = rowsOf<LicenseClients['clients'][number]>(
    await db.execute(sql`
      SELECT c.id AS id,
             c.short_name AS short_name,
             c.company_name AS company_name,
             count(${licenseT.id})::int AS total,
             count(*) FILTER (WHERE ${isStatus('ACTIVE')})::int AS active,
             round(
               count(*) FILTER (WHERE ${isStatus('ACTIVE')})::numeric * 100
               / NULLIF(count(${licenseT.id}), 0), 0
             )::float AS success_rate
        FROM client_master_t c
        JOIN ${licenseT} ON ${licenseT.clientId} = c.id AND ${base}
       WHERE c.display = 'Y'
       GROUP BY c.id, c.short_name, c.company_name
       ORDER BY count(${licenseT.id}) DESC`),
  );

  return {
    stats: stats ?? { total_clients: 0, active_clients: 0, with_licenses: 0, verified_clients: 0 },
    clients,
  };
}

export interface LicenseClientDetail {
  id: number;
  short_name: string | null;
  company_name: string | null;
  client_type: string | null;
  contact_person: string | null;
  email: string | null;
  payment_term: string | null;
  display: string;
  total: number;
  active: number;
  success_rate: number;
  last_license_date: string | null;
  breakdowns: {
    status: DistributionRow[];
    transport: DistributionRow[];
    goods: DistributionRow[];
    bank: DistributionRow[];
    payment: DistributionRow[];
  };
}

/** One client's profile, with the five breakdowns the panel shows. */
export async function getLicenseClientDetail(
  clientId: number,
  useFor?: LicenseUseFor,
): Promise<LicenseClientDetail | null> {
  const base = sql`${scope(useFor)} AND ${licenseT.clientId} = ${clientId}`;

  const [client] = rowsOf<Omit<LicenseClientDetail, 'breakdowns'>>(
    await db.execute(sql`
      SELECT c.id AS id,
             c.short_name AS short_name,
             c.company_name AS company_name,
             c.client_type AS client_type,
             c.contact_person AS contact_person,
             c.email AS email,
             c.payment_term AS payment_term,
             c.display AS display,
             (SELECT count(*) FROM ${licenseT} WHERE ${base})::int AS total,
             (SELECT count(*) FROM ${licenseT} WHERE ${base} AND ${isStatus('ACTIVE')})::int AS active,
             COALESCE((
               SELECT round(
                 count(*) FILTER (WHERE ${isStatus('ACTIVE')})::numeric * 100 / NULLIF(count(*), 0), 0)
                 FROM ${licenseT} WHERE ${base}
             ), 0)::float AS success_rate,
             (SELECT to_char(max(${licenseT.licenseAppliedDate}), 'YYYY-MM-DD') FROM ${licenseT} WHERE ${base})
               AS last_license_date
        FROM client_master_t c
       WHERE c.id = ${clientId} AND c.display = 'Y'`),
  );
  if (!client) return null;

  const statusBreakdown = rowsOf<DistributionRow>(
    await db.execute(sql`
      SELECT COALESCE(NULLIF(upper(${licenseT.status}), ''), 'Not Set') AS label, count(*)::int AS count
        FROM ${licenseT}
       WHERE ${base}
       GROUP BY COALESCE(NULLIF(upper(${licenseT.status}), ''), 'Not Set')
       ORDER BY count(*) DESC`),
  );

  const [transport, goods, bank, payment] = await Promise.all([
    distribution('transport_mode_master_t', 'transport_mode_name', sql`${licenseT.transportModeId}`, base),
    distribution('type_of_goods_master_t', 'goods_type', sql`${licenseT.typeOfGoodsId}`, base),
    distribution('banklist_master_t', 'bank_name', sql`${licenseT.bankId}`, base),
    distribution('payment_method_master_t', 'payment_method_name', sql`${licenseT.paymentMethodId}`, base),
  ]);

  return {
    ...client,
    breakdowns: { status: statusBreakdown, transport, goods, bank, payment },
  };
}
