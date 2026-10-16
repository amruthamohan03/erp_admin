import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportInvoices, importInvoices } from '@/db/schema';
import { DGI_COMPLETE as EXPORT_DGI_COMPLETE } from './exportInvoiceExtras';
import { DGI_COMPLETE as IMPORT_DGI_COMPLETE } from './importInvoiceExtras';
import type { InvoiceDashboardTab, InvoiceKind } from '@/schemas/invoice-dashboard';

// §4.29 — the data behind the Export Invoice and Import Invoice dashboards.
//
// ONE module for both. The two invoice tables store their money and their DGI
// state differently, so each kind supplies a handful of SQL fragments (KIND)
// and everything else — the periods, the status ladder, every aggregate — is
// written once against a normalised row (`base`). A rule changed here changes
// both dashboards, which is the point (§4.10).
//
// Same two rules as the other dashboards:
//
//  1. Every figure is a SQL aggregate over live rows (`display = 'Y'`, §4.27).
//  2. Money is summed in SQL as `numeric` and only cast to float at the edge.

function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

interface KindSql {
  /** FROM … with the invoice aliased `inv`, plus whatever the money needs. */
  from: SQL;
  subTotal: SQL;
  vat: SQL;
  total: SQL;
  /** The column holding CREDIT / CASH / … — the two tables name it differently. */
  payment: SQL;
  /** DGI-verified, by the same rule the invoice list's filter uses. */
  verified: SQL;
  /** "DGI info complete" — the list's rule, imported rather than restated. */
  dgiComplete: SQL;
}

const KIND: Record<InvoiceKind, KindSql> = {
  // An export invoice holds no total of its own: it is the sum of its lines,
  // exactly as the printed invoice's Grand Total adds them (exportInvoicePrint).
  export: {
    from: sql`
      FROM ${exportInvoices} inv
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(it.subtotal_usd), 0) AS sub, COALESCE(SUM(it.tva_usd), 0) AS tva
          FROM export_invoice_items_t it
         WHERE it.export_invoice_id = inv.id
      ) amt ON true`,
    subTotal: sql`amt.sub`,
    vat: sql`amt.tva`,
    total: sql`(amt.sub + amt.tva)`,
    payment: sql`inv.payment_mode`,
    verified: sql`(inv.validated = 2)`,
    dgiComplete: EXPORT_DGI_COMPLETE,
  },
  // An import invoice carries its calculated totals; the list falls back to the
  // CIF value when they are absent, and so does this.
  import: {
    from: sql`FROM ${importInvoices} inv`,
    subTotal: sql`COALESCE(inv.calculated_sub_total, 0)`,
    vat: sql`COALESCE(inv.calculated_vat_amount, 0)`,
    total: sql`COALESCE(inv.calculated_total_amount, inv.cif_usd, 0)`,
    payment: sql`inv.payment_method`,
    verified: sql`(inv.validated = 2 OR ${IMPORT_DGI_COMPLETE})`,
    dgiComplete: IMPORT_DGI_COMPLETE,
  },
};

/**
 * Where an invoice sits in the validation ladder. Words the status badge
 * already classifies (§4.38): pending is amber, verified violet.
 */
export type InvoiceStatus = 'Not Validated' | 'Validated' | 'DGI Info Pending' | 'DGI Verified';

/** Disjoint period bands — the cumulative cards add them up client-side. */
export type PeriodFlag = 'TODAY' | 'THISWEEK' | 'THISMONTH' | 'THISYEAR' | 'OLDER';

/** How long an invoice not yet DGI-verified has been waiting. */
export type AgeBand = 'D0_7' | 'D8_30' | 'D31_60' | 'D60_PLUS';

/**
 * The normalised invoice row every aggregate reads.
 *
 * Counted on `created_at` — the date the invoice list shows and filters by — so
 * a card and the list it points at agree on which month an invoice belongs to.
 * The export table has an `invoice_date` too, but the import table does not,
 * and the two dashboards must not count periods by different rules.
 */
function base(kind: InvoiceKind): SQL {
  const k = KIND[kind];
  return sql`
    SELECT inv.id,
           inv.invoice_ref,
           inv.created_at::date AS inv_date,
           inv.client_id,
           c.short_name AS client_name,
           c.company_name AS client_company,
           tg.goods_type AS goods_type,
           COALESCE(NULLIF(upper(trim(${k.payment})), ''), 'UNSPECIFIED') AS payment_mode,
           ${k.subTotal}::numeric AS sub_total,
           ${k.vat}::numeric AS vat,
           ${k.total}::numeric AS total,
           COALESCE(inv.dgi_amount, 0)::numeric AS dgi_amount,
           CASE
             WHEN ${k.verified} THEN 'DGI Verified'
             WHEN inv.validated = 1 AND NOT ${k.dgiComplete} THEN 'DGI Info Pending'
             WHEN inv.validated = 1 THEN 'Validated'
             ELSE 'Not Validated'
           END AS status,
           ${k.verified} AS verified,
           (current_date - inv.created_at::date) AS age_days
    ${k.from}
    LEFT JOIN client_master_t c ON c.id = inv.client_id
    LEFT JOIN type_of_goods_master_t tg ON tg.id = inv.goods_type_id
    WHERE inv.display = 'Y'`;
}

const PERIOD_FLAG: SQL = sql`
  CASE
    WHEN b.inv_date = current_date THEN 'TODAY'
    WHEN date_trunc('week', b.inv_date) = date_trunc('week', current_date) THEN 'THISWEEK'
    WHEN date_trunc('month', b.inv_date) = date_trunc('month', current_date) THEN 'THISMONTH'
    WHEN date_trunc('year', b.inv_date) = date_trunc('year', current_date) THEN 'THISYEAR'
    ELSE 'OLDER'
  END`;

const AGE_BAND: SQL = sql`
  CASE
    WHEN b.age_days <= 7 THEN 'D0_7'
    WHEN b.age_days <= 30 THEN 'D8_30'
    WHEN b.age_days <= 60 THEN 'D31_60'
    ELSE 'D60_PLUS'
  END`;

/** The last twelve calendar months, oldest first, including the current one. */
const MONTHS: SQL = sql`
  SELECT generate_series(
           date_trunc('month', current_date) - interval '11 months',
           date_trunc('month', current_date),
           interval '1 month')::date AS m`;

// ─────────────────────────────────────────────────────────────────────────────
// Rows
// ─────────────────────────────────────────────────────────────────────────────

export interface InvoiceRow {
  id: number;
  invoice_ref: string | null;
  inv_date: string;
  client_id: number | null;
  client_name: string | null;
  client_company: string | null;
  goods_type: string | null;
  payment_mode: string;
  sub_total: number;
  vat: number;
  total: number;
  dgi_amount: number;
  status: InvoiceStatus;
  age_days: number;
  period_flag: PeriodFlag;
  age_band: AgeBand;
}

/** Every live invoice of a kind, newest first. `pendingOnly` = not DGI-verified. */
export async function getInvoiceRows(kind: InvoiceKind, pendingOnly = false): Promise<InvoiceRow[]> {
  const res = await db.execute(sql`
    WITH b AS (${base(kind)})
    SELECT b.id, b.invoice_ref, to_char(b.inv_date, 'YYYY-MM-DD') AS inv_date,
           b.client_id, b.client_name, b.client_company, b.goods_type, b.payment_mode,
           b.sub_total::float AS sub_total, b.vat::float AS vat, b.total::float AS total,
           b.dgi_amount::float AS dgi_amount, b.status, b.age_days::int AS age_days,
           ${PERIOD_FLAG} AS period_flag, ${AGE_BAND} AS age_band
      FROM b
     ${pendingOnly ? sql`WHERE NOT b.verified` : sql``}
     ORDER BY b.id DESC`);
  return rowsOf<InvoiceRow>(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────────

export interface InvoiceKpi {
  total: number;
  total_usd: number;
  sub_total_usd: number;
  vat_usd: number;
  avg_usd: number;
  dgi_usd: number;
  unique_clients: number;
  not_validated: number;
  validated: number;
  dgi_pending: number;
  dgi_verified: number;
  today: number;
  this_week: number;
  this_month: number;
  this_year: number;
}

export interface MonthPoint {
  month_short: string;
  count: number;
  value_usd: number;
}

export interface Distribution {
  label: string;
  count: number;
  value_usd: number;
}

export interface InvoiceOverview {
  kpi: InvoiceKpi;
  monthly: MonthPoint[];
  status: Distribution[];
  goods: Distribution[];
  rows: InvoiceRow[];
}

async function kpiFor(kind: InvoiceKind): Promise<InvoiceKpi> {
  const res = await db.execute(sql`
    WITH b AS (${base(kind)})
    SELECT count(*)::int AS total,
           COALESCE(SUM(b.total), 0)::float AS total_usd,
           COALESCE(SUM(b.sub_total), 0)::float AS sub_total_usd,
           COALESCE(SUM(b.vat), 0)::float AS vat_usd,
           COALESCE(AVG(b.total), 0)::float AS avg_usd,
           COALESCE(SUM(b.dgi_amount), 0)::float AS dgi_usd,
           count(DISTINCT b.client_id)::int AS unique_clients,
           count(*) FILTER (WHERE b.status = 'Not Validated')::int AS not_validated,
           count(*) FILTER (WHERE b.status = 'Validated')::int AS validated,
           count(*) FILTER (WHERE b.status = 'DGI Info Pending')::int AS dgi_pending,
           count(*) FILTER (WHERE b.status = 'DGI Verified')::int AS dgi_verified,
           count(*) FILTER (WHERE b.inv_date = current_date)::int AS today,
           count(*) FILTER (WHERE date_trunc('week', b.inv_date) = date_trunc('week', current_date))::int AS this_week,
           count(*) FILTER (WHERE date_trunc('month', b.inv_date) = date_trunc('month', current_date))::int AS this_month,
           count(*) FILTER (WHERE date_trunc('year', b.inv_date) = date_trunc('year', current_date))::int AS this_year
      FROM b`);
  return rowsOf<InvoiceKpi>(res)[0];
}

async function monthlyFor(kind: InvoiceKind): Promise<MonthPoint[]> {
  const res = await db.execute(sql`
    WITH b AS (${base(kind)}), months AS (${MONTHS})
    SELECT to_char(months.m, 'Mon YY') AS month_short,
           count(b.id)::int AS count,
           COALESCE(SUM(b.total), 0)::float AS value_usd
      FROM months
      LEFT JOIN b ON date_trunc('month', b.inv_date) = months.m
     GROUP BY months.m
     ORDER BY months.m`);
  return rowsOf<MonthPoint>(res);
}

async function distributionBy(kind: InvoiceKind, column: SQL, nullLabel: string): Promise<Distribution[]> {
  const res = await db.execute(sql`
    WITH b AS (${base(kind)})
    SELECT COALESCE(${column}, ${nullLabel}) AS label,
           count(*)::int AS count,
           COALESCE(SUM(b.total), 0)::float AS value_usd
      FROM b
     GROUP BY 1
     ORDER BY value_usd DESC, count DESC`);
  return rowsOf<Distribution>(res);
}

export async function getInvoiceOverview(kind: InvoiceKind): Promise<InvoiceOverview> {
  const [kpi, monthly, status, goods, rows] = await Promise.all([
    kpiFor(kind),
    monthlyFor(kind),
    distributionBy(kind, sql`b.status`, 'Not Validated'),
    distributionBy(kind, sql`b.goods_type`, 'Not specified'),
    getInvoiceRows(kind),
  ]);
  return { kpi, monthly, status, goods, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientSummary {
  client_id: number | null;
  client_name: string | null;
  client_company: string | null;
  count: number;
  value_usd: number;
  vat_usd: number;
  avg_usd: number;
  verified: number;
  pending: number;
  last_date: string | null;
  share_pct: number;
}

export interface InvoiceClients {
  total_clients: number;
  total_usd: number;
  clients: ClientSummary[];
}

export async function getInvoiceClients(kind: InvoiceKind): Promise<InvoiceClients> {
  const res = await db.execute(sql`
    WITH b AS (${base(kind)}),
         g AS (SELECT COALESCE(SUM(b.total), 0) AS grand FROM b)
    SELECT b.client_id,
           max(b.client_name) AS client_name,
           max(b.client_company) AS client_company,
           count(*)::int AS count,
           COALESCE(SUM(b.total), 0)::float AS value_usd,
           COALESCE(SUM(b.vat), 0)::float AS vat_usd,
           COALESCE(AVG(b.total), 0)::float AS avg_usd,
           count(*) FILTER (WHERE b.verified)::int AS verified,
           count(*) FILTER (WHERE NOT b.verified)::int AS pending,
           to_char(max(b.inv_date), 'YYYY-MM-DD') AS last_date,
           CASE WHEN g.grand > 0 THEN (SUM(b.total) * 100 / g.grand)::float ELSE 0 END AS share_pct
      FROM b CROSS JOIN g
     GROUP BY b.client_id, g.grand
     ORDER BY value_usd DESC, count DESC`);
  const clients = rowsOf<ClientSummary>(res);
  return {
    total_clients: clients.length,
    total_usd: clients.reduce((s, c) => s + c.value_usd, 0),
    clients,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation & DGI
// ─────────────────────────────────────────────────────────────────────────────

export interface AgeBucket {
  band: AgeBand;
  label: string;
  count: number;
  value_usd: number;
}

export interface VerifiedMonth {
  month_short: string;
  created: number;
  verified: number;
  dgi_usd: number;
}

export interface InvoiceValidation {
  kpi: InvoiceKpi;
  status: Distribution[];
  ageing: AgeBucket[];
  monthly: VerifiedMonth[];
  /** Invoices not yet DGI-verified — the work still to do. */
  pending: InvoiceRow[];
}

const AGE_LABELS: Array<{ band: AgeBand; label: string }> = [
  { band: 'D0_7', label: '0–7 days' },
  { band: 'D8_30', label: '8–30 days' },
  { band: 'D31_60', label: '31–60 days' },
  { band: 'D60_PLUS', label: 'Over 60 days' },
];

export async function getInvoiceValidation(kind: InvoiceKind): Promise<InvoiceValidation> {
  const [kpi, status, pending, monthlyRes] = await Promise.all([
    kpiFor(kind),
    distributionBy(kind, sql`b.status`, 'Not Validated'),
    getInvoiceRows(kind, true),
    db.execute(sql`
      WITH b AS (${base(kind)}), months AS (${MONTHS})
      SELECT to_char(months.m, 'Mon YY') AS month_short,
             count(b.id)::int AS created,
             count(b.id) FILTER (WHERE b.verified)::int AS verified,
             COALESCE(SUM(b.dgi_amount), 0)::float AS dgi_usd
        FROM months
        LEFT JOIN b ON date_trunc('month', b.inv_date) = months.m
       GROUP BY months.m
       ORDER BY months.m`),
  ]);

  // Every band is present, even an empty one, so the chart's axis is stable.
  const ageing = AGE_LABELS.map(({ band, label }) => {
    const inBand = pending.filter((r) => r.age_band === band);
    return { band, label, count: inBand.length, value_usd: inBand.reduce((s, r) => s + r.total, 0) };
  });

  return { kpi, status, ageing, monthly: rowsOf<VerifiedMonth>(monthlyRes), pending };
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment mode
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentModeMonth {
  month_short: string;
  /** Count per payment mode, in the same order as `modes`. */
  counts: number[];
  values: number[];
}

export interface InvoicePayment {
  modes: Distribution[];
  monthly: PaymentModeMonth[];
}

export async function getInvoicePayment(kind: InvoiceKind): Promise<InvoicePayment> {
  const modes = await distributionBy(kind, sql`b.payment_mode`, 'UNSPECIFIED');
  const res = await db.execute(sql`
    WITH b AS (${base(kind)}), months AS (${MONTHS})
    SELECT to_char(months.m, 'Mon YY') AS month_short,
           b.payment_mode,
           count(b.id)::int AS count,
           COALESCE(SUM(b.total), 0)::float AS value_usd
      FROM months
      LEFT JOIN b ON date_trunc('month', b.inv_date) = months.m
     GROUP BY months.m, b.payment_mode
     ORDER BY months.m`);
  const cells = rowsOf<{ month_short: string; payment_mode: string | null; count: number; value_usd: number }>(res);

  // Pivot to one point per month, every mode present, so each series has a
  // value for every label.
  const order = [...new Set(cells.map((c) => c.month_short))];
  const monthly = order.map((month_short) => {
    const inMonth = cells.filter((c) => c.month_short === month_short);
    return {
      month_short,
      counts: modes.map((m) => inMonth.find((c) => c.payment_mode === m.label)?.count ?? 0),
      values: modes.map((m) => inMonth.find((c) => c.payment_mode === m.label)?.value_usd ?? 0),
    };
  });
  return { modes, monthly };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * One tab's data. Both dashboards' tab routes call this, so the two routes
 * differ only in the kind they pass.
 */
export async function getInvoiceDashboardTab(
  kind: InvoiceKind,
  tab: InvoiceDashboardTab,
): Promise<InvoiceOverview | InvoiceClients | InvoiceValidation | InvoicePayment> {
  switch (tab) {
    case 'overview':
      return getInvoiceOverview(kind);
    case 'clients':
      return getInvoiceClients(kind);
    case 'validation':
      return getInvoiceValidation(kind);
    case 'payment':
      return getInvoicePayment(kind);
  }
}
