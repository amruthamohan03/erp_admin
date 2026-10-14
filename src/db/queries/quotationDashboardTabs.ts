import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotations } from '@/db/schema';

// §4.29 — the data behind the Quotation dashboard's four tabs.
//
// Built the same way as the Import Tracking and Licence dashboards, from the
// same shape of module, so the three read alike and share their UI kit (§4.10).
//
// Two rules hold throughout:
//
//  1. Every figure is a SQL aggregate over live rows. Nothing is counted from
//     the page of rows the screen happens to hold.
//  2. Money is summed in SQL as `numeric` and only cast to float at the edge.
//     The columns are `numeric(15,2)` precisely so a quotation's total is exact;
//     adding them up in JavaScript would hand that back.

function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

/** Soft-deleted quotations are out of every figure (§4.27). */
const LIVE: SQL = sql`${quotations.display} = 'Y'`;

/**
 * The date a quotation is counted ON.
 *
 * `quotation_date` is the business date the operator put on the document, and
 * it is what the list's Date column shows — so a period card must count it, or
 * clicking "This Month" reveals rows dated some other month. It is nullable, so
 * every period predicate is written to exclude NULL rather than accidentally
 * bucket it (`NULL >= x` is NULL, not false, which is the same thing inside a
 * FILTER but not inside a CASE).
 */
const qdate: SQL = sql`${quotations.quotationDate}`;

export interface QuotationKpiRow {
  total: number;
  total_usd: number;
  total_cdf: number;
  sub_total_usd: number;
  vat_usd: number;
  arsp_usd: number;
  avg_usd: number;
  max_usd: number;
  arsp_enabled: number;
  with_cdf: number;
  unique_clients: number;
  unique_kinds: number;
  today: number;
  this_week: number;
  this_month: number;
  last_month: number;
  this_year: number;
  no_date: number;
}

export interface DistributionRow {
  label: string;
  count: number;
  value_usd: number;
}

export type PeriodFlag = 'TODAY' | 'THISWEEK' | 'THISMONTH' | 'THISYEAR' | 'OLDER';

/**
 * A value band. Disjoint, so the rows add up to the total — the KPI cards above
 * them are not cumulative here, because "how many quotations are big" is a
 * different question from "how many are at least this big".
 */
export type ValueBand = 'UNDER_1K' | 'B1K_5K' | 'B5K_20K' | 'B20K_50K' | 'OVER_50K' | 'ZERO';

export interface QuotationRow {
  id: number;
  quotation_ref: string | null;
  quotation_date: string | null;
  client_name: string | null;
  kind_name: string | null;
  transport_mode_name: string | null;
  goods_type: string | null;
  sub_total: number;
  vat_amount: number;
  arsp_amount: number;
  total_amount: number;
  total_amount_cdf: number | null;
  arsp: string | null;
  line_count: number;
  period_flag: PeriodFlag;
  value_band: ValueBand;
}

const PERIOD_FLAG: SQL = sql`
  CASE
    WHEN ${qdate} IS NULL THEN 'OLDER'
    WHEN ${qdate} = current_date THEN 'TODAY'
    WHEN date_trunc('week', ${qdate}) = date_trunc('week', current_date) THEN 'THISWEEK'
    WHEN date_trunc('month', ${qdate}) = date_trunc('month', current_date) THEN 'THISMONTH'
    WHEN date_trunc('year', ${qdate}) = date_trunc('year', current_date) THEN 'THISYEAR'
    ELSE 'OLDER'
  END`;

const VALUE_BAND: SQL = sql`
  CASE
    WHEN COALESCE(${quotations.totalAmount}, 0) <= 0 THEN 'ZERO'
    WHEN ${quotations.totalAmount} < 1000 THEN 'UNDER_1K'
    WHEN ${quotations.totalAmount} < 5000 THEN 'B1K_5K'
    WHEN ${quotations.totalAmount} < 20000 THEN 'B5K_20K'
    WHEN ${quotations.totalAmount} < 50000 THEN 'B20K_50K'
    ELSE 'OVER_50K'
  END`;

/** The live line count per quotation, as a scalar so it rides with the row. */
const LINE_COUNT: SQL = sql`(
  SELECT count(*)::int FROM quotation_items_t i
   WHERE i.quotation_id = ${quotations.id} AND i.display = 'Y')`;

/** The row projection every tab's table is built from — one SELECT, reused. */
const QUOTATION_SELECT: SQL = sql`
  SELECT ${quotations.id} AS id,
         ${quotations.quotationRef} AS quotation_ref,
         ${quotations.quotationDate} AS quotation_date,
         c.short_name AS client_name,
         k.kind_name AS kind_name,
         tm.transport_mode_name AS transport_mode_name,
         tg.goods_type AS goods_type,
         COALESCE(${quotations.subTotal}, 0)::float AS sub_total,
         COALESCE(${quotations.vatAmount}, 0)::float AS vat_amount,
         COALESCE(${quotations.arspAmount}, 0)::float AS arsp_amount,
         COALESCE(${quotations.totalAmount}, 0)::float AS total_amount,
         ${quotations.totalAmountCdf}::float AS total_amount_cdf,
         ${quotations.arsp} AS arsp,
         ${LINE_COUNT} AS line_count,
         ${PERIOD_FLAG} AS period_flag,
         ${VALUE_BAND} AS value_band
    FROM ${quotations}
    LEFT JOIN client_master_t c ON c.id = ${quotations.clientId}
    LEFT JOIN kind_master_t k ON k.id = ${quotations.kindId}
    LEFT JOIN transport_mode_master_t tm ON tm.id = ${quotations.transportModeId}
    LEFT JOIN type_of_goods_master_t tg ON tg.id = ${quotations.goodsTypeId}
   WHERE ${LIVE}`;

/** Quotations grouped by a referenced master's label, with their value. */
async function distribution(table: string, labelColumn: string, fk: SQL): Promise<DistributionRow[]> {
  return rowsOf<DistributionRow>(
    await db.execute(sql`
      SELECT COALESCE(m.${sql.identifier(labelColumn)}, 'Not Specified') AS label,
             count(*)::int AS count,
             COALESCE(sum(${quotations.totalAmount}), 0)::float AS value_usd
        FROM ${quotations}
        LEFT JOIN ${sql.identifier(table)} m ON m.id = ${fk} AND m.display = 'Y'
       WHERE ${LIVE}
       GROUP BY COALESCE(m.${sql.identifier(labelColumn)}, 'Not Specified')
       ORDER BY count(*) DESC`),
  );
}

// ===================================================================
// Overview
// ===================================================================

export interface QuotationOverview {
  kpi: QuotationKpiRow;
  kind: DistributionRow[];
  transport: DistributionRow[];
  goods: DistributionRow[];
  monthly: Array<{ month: string; month_name: string; month_short: string; count: number; value_usd: number }>;
  rows: QuotationRow[];
}

export async function getQuotationOverview(): Promise<QuotationOverview> {
  const [kpi] = rowsOf<QuotationKpiRow>(
    await db.execute(sql`
      SELECT count(*)::int AS total,
             COALESCE(sum(${quotations.totalAmount}), 0)::float AS total_usd,
             COALESCE(sum(${quotations.totalAmountCdf}), 0)::float AS total_cdf,
             COALESCE(sum(${quotations.subTotal}), 0)::float AS sub_total_usd,
             COALESCE(sum(${quotations.vatAmount}), 0)::float AS vat_usd,
             COALESCE(sum(${quotations.arspAmount}), 0)::float AS arsp_usd,
             COALESCE(avg(${quotations.totalAmount}), 0)::float AS avg_usd,
             COALESCE(max(${quotations.totalAmount}), 0)::float AS max_usd,
             count(*) FILTER (WHERE ${quotations.arsp} = 'Enabled')::int AS arsp_enabled,
             count(*) FILTER (WHERE ${quotations.totalAmountCdf} IS NOT NULL)::int AS with_cdf,
             count(DISTINCT ${quotations.clientId})::int AS unique_clients,
             count(DISTINCT ${quotations.kindId})::int AS unique_kinds,
             count(*) FILTER (WHERE ${qdate} = current_date)::int AS today,
             count(*) FILTER (
               WHERE ${qdate} IS NOT NULL
                 AND date_trunc('week', ${qdate}) = date_trunc('week', current_date)
             )::int AS this_week,
             count(*) FILTER (
               WHERE ${qdate} IS NOT NULL
                 AND date_trunc('month', ${qdate}) = date_trunc('month', current_date)
             )::int AS this_month,
             count(*) FILTER (
               WHERE ${qdate} IS NOT NULL
                 AND date_trunc('month', ${qdate}) = date_trunc('month', current_date - interval '1 month')
             )::int AS last_month,
             count(*) FILTER (
               WHERE ${qdate} IS NOT NULL
                 AND date_trunc('year', ${qdate}) = date_trunc('year', current_date)
             )::int AS this_year,
             count(*) FILTER (WHERE ${qdate} IS NULL)::int AS no_date
        FROM ${quotations}
       WHERE ${LIVE}`),
  );

  // Every month in the window, including the quiet ones — a gap in a trend is
  // information, and a series that omits an empty month draws a straight line
  // through it.
  const monthly = rowsOf<QuotationOverview['monthly'][number]>(
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
             COALESCE((SELECT count(*) FROM ${quotations}
                        WHERE ${LIVE} AND date_trunc('month', ${qdate}) = months.m), 0)::int AS count,
             COALESCE((SELECT sum(${quotations.totalAmount}) FROM ${quotations}
                        WHERE ${LIVE} AND date_trunc('month', ${qdate}) = months.m), 0)::float AS value_usd
        FROM months
       ORDER BY months.m`),
  );

  const [kind, transport, goods, rows] = await Promise.all([
    distribution('kind_master_t', 'kind_name', sql`${quotations.kindId}`),
    distribution('transport_mode_master_t', 'transport_mode_name', sql`${quotations.transportModeId}`),
    distribution('type_of_goods_master_t', 'goods_type', sql`${quotations.goodsTypeId}`),
    db
      .execute(sql`${QUOTATION_SELECT} ORDER BY ${quotations.createdAt} DESC LIMIT 5000`)
      .then((r) => rowsOf<QuotationRow>(r)),
  ]);

  return {
    kpi: kpi ?? {
      total: 0, total_usd: 0, total_cdf: 0, sub_total_usd: 0, vat_usd: 0, arsp_usd: 0,
      avg_usd: 0, max_usd: 0, arsp_enabled: 0, with_cdf: 0, unique_clients: 0,
      unique_kinds: 0, today: 0, this_week: 0, this_month: 0, last_month: 0,
      this_year: 0, no_date: 0,
    },
    kind,
    transport,
    goods,
    monthly,
    rows,
  };
}

// ===================================================================
// Value
// ===================================================================

export interface QuotationValue {
  kpi: {
    sub_total_usd: number;
    vat_usd: number;
    arsp_usd: number;
    total_usd: number;
    total_cdf: number;
    avg_usd: number;
    median_usd: number;
    max_usd: number;
  };
  bands: Array<{ band: ValueBand; count: number; value_usd: number }>;
  top: QuotationRow[];
  rows: QuotationRow[];
}

export async function getQuotationValue(): Promise<QuotationValue> {
  const [kpi] = rowsOf<QuotationValue['kpi']>(
    await db.execute(sql`
      SELECT COALESCE(sum(${quotations.subTotal}), 0)::float AS sub_total_usd,
             COALESCE(sum(${quotations.vatAmount}), 0)::float AS vat_usd,
             COALESCE(sum(${quotations.arspAmount}), 0)::float AS arsp_usd,
             COALESCE(sum(${quotations.totalAmount}), 0)::float AS total_usd,
             COALESCE(sum(${quotations.totalAmountCdf}), 0)::float AS total_cdf,
             COALESCE(avg(${quotations.totalAmount}), 0)::float AS avg_usd,
             -- The median says more than the mean about a book where one large
             -- quotation can carry the average away from every actual document.
             -- Cast to float8 explicitly: percentile_cont is defined over
             -- double precision, and leaning on the implicit numeric cast is
             -- the kind of thing that resolves differently under a different
             -- server version.
             COALESCE(
               percentile_cont(0.5) WITHIN GROUP (ORDER BY ${quotations.totalAmount}::float8), 0
             )::float AS median_usd,
             COALESCE(max(${quotations.totalAmount}), 0)::float AS max_usd
        FROM ${quotations}
       WHERE ${LIVE}`),
  );

  const bands = rowsOf<QuotationValue['bands'][number]>(
    await db.execute(sql`
      SELECT ${VALUE_BAND} AS band,
             count(*)::int AS count,
             COALESCE(sum(${quotations.totalAmount}), 0)::float AS value_usd
        FROM ${quotations}
       WHERE ${LIVE}
       GROUP BY ${VALUE_BAND}`),
  );

  const [top, rows] = await Promise.all([
    db
      .execute(sql`${QUOTATION_SELECT} ORDER BY ${quotations.totalAmount} DESC NULLS LAST LIMIT 10`)
      .then((r) => rowsOf<QuotationRow>(r)),
    db
      .execute(sql`${QUOTATION_SELECT} ORDER BY ${quotations.totalAmount} DESC NULLS LAST LIMIT 5000`)
      .then((r) => rowsOf<QuotationRow>(r)),
  ]);

  return {
    kpi: kpi ?? {
      sub_total_usd: 0, vat_usd: 0, arsp_usd: 0, total_usd: 0, total_cdf: 0,
      avg_usd: 0, median_usd: 0, max_usd: 0,
    },
    bands,
    top,
    rows,
  };
}

// ===================================================================
// Categories & items
// ===================================================================

export interface CategoryRow {
  id: number | null;
  category_name: string | null;
  is_customs: boolean;
  lines: number;
  quotations: number;
  value_usd: number;
  value_cdf: number;
  tva_usd: number;
  with_tva: number;
}

export interface ItemRow {
  item_name: string | null;
  category_name: string | null;
  lines: number;
  quantity: number;
  value_usd: number;
}

export interface QuotationCategories {
  kpi: {
    lines: number;
    customs_lines: number;
    tva_lines: number;
    unique_items: number;
    avg_lines: number;
    value_usd: number;
    value_cdf: number;
  };
  categories: CategoryRow[];
  items: ItemRow[];
  units: Array<{ label: string; count: number }>;
}

/** Live lines on live quotations — a line on a deleted quotation is gone too. */
const LIVE_LINE: SQL = sql`
  i.display = 'Y'
  AND EXISTS (SELECT 1 FROM ${quotations} WHERE ${quotations.id} = i.quotation_id AND ${LIVE})`;

export async function getQuotationCategories(): Promise<QuotationCategories> {
  const [kpi] = rowsOf<QuotationCategories['kpi']>(
    await db.execute(sql`
      SELECT count(*)::int AS lines,
             count(*) FILTER (WHERE cat.is_customs)::int AS customs_lines,
             count(*) FILTER (WHERE i.has_tva)::int AS tva_lines,
             count(DISTINCT i.item_id)::int AS unique_items,
             COALESCE(
               count(*)::numeric / NULLIF(count(DISTINCT i.quotation_id), 0), 0
             )::float AS avg_lines,
             COALESCE(sum(i.total_usd), 0)::float AS value_usd,
             COALESCE(sum(i.total_cdf), 0)::float AS value_cdf
        FROM quotation_items_t i
        LEFT JOIN quotation_category_master_t cat ON cat.id = i.category_id
       WHERE ${LIVE_LINE}`),
  );

  const categories = rowsOf<CategoryRow>(
    await db.execute(sql`
      SELECT cat.id AS id,
             COALESCE(cat.category_name, 'Uncategorised') AS category_name,
             COALESCE(cat.is_customs, false) AS is_customs,
             count(*)::int AS lines,
             count(DISTINCT i.quotation_id)::int AS quotations,
             COALESCE(sum(i.total_usd), 0)::float AS value_usd,
             COALESCE(sum(i.total_cdf), 0)::float AS value_cdf,
             COALESCE(sum(i.tva_usd), 0)::float AS tva_usd,
             count(*) FILTER (WHERE i.has_tva)::int AS with_tva
        FROM quotation_items_t i
        LEFT JOIN quotation_category_master_t cat ON cat.id = i.category_id
       WHERE ${LIVE_LINE}
       GROUP BY cat.id, cat.category_name, cat.is_customs, cat.display_order
       ORDER BY COALESCE(cat.display_order, 9999), count(*) DESC`),
  );

  const items = rowsOf<ItemRow>(
    await db.execute(sql`
      SELECT COALESCE(it.item_name, 'Not Specified') AS item_name,
             COALESCE(cat.category_name, 'Uncategorised') AS category_name,
             count(*)::int AS lines,
             COALESCE(sum(i.quantity), 0)::float AS quantity,
             COALESCE(sum(i.total_usd), 0)::float AS value_usd
        FROM quotation_items_t i
        LEFT JOIN item_master_t it ON it.id = i.item_id
        LEFT JOIN quotation_category_master_t cat ON cat.id = i.category_id
       WHERE ${LIVE_LINE}
       GROUP BY COALESCE(it.item_name, 'Not Specified'), COALESCE(cat.category_name, 'Uncategorised')
       ORDER BY count(*) DESC, sum(i.total_usd) DESC NULLS LAST
       LIMIT 25`),
  );

  // `unit_text` is the legacy free-form fallback, so the unit is read from the
  // master first and only falls back to what was typed.
  const units = rowsOf<{ label: string; count: number }>(
    await db.execute(sql`
      SELECT COALESCE(NULLIF(u.unit_name, ''), NULLIF(i.unit_text, ''), 'Not Specified') AS label,
             count(*)::int AS count
        FROM quotation_items_t i
        LEFT JOIN unit_master_t u ON u.id = i.unit_id
       WHERE ${LIVE_LINE}
       GROUP BY COALESCE(NULLIF(u.unit_name, ''), NULLIF(i.unit_text, ''), 'Not Specified')
       ORDER BY count(*) DESC
       LIMIT 10`),
  );

  return {
    kpi: kpi ?? {
      lines: 0, customs_lines: 0, tva_lines: 0, unique_items: 0, avg_lines: 0,
      value_usd: 0, value_cdf: 0,
    },
    categories,
    items,
    units,
  };
}

// ===================================================================
// Clients
// ===================================================================

export interface QuotationClients {
  stats: { total_clients: number; with_quotations: number; active_clients: number; avg_per_client: number };
  clients: Array<{
    id: number;
    short_name: string | null;
    company_name: string | null;
    total: number;
    value_usd: number;
    avg_usd: number;
    last_quotation_date: string | null;
  }>;
}

export async function getQuotationClients(): Promise<QuotationClients> {
  const [stats] = rowsOf<QuotationClients['stats']>(
    await db.execute(sql`
      SELECT count(*)::int AS total_clients,
             count(*) FILTER (WHERE c.display = 'Y')::int AS active_clients,
             (SELECT count(DISTINCT ${quotations.clientId}) FROM ${quotations} WHERE ${LIVE})::int
               AS with_quotations,
             COALESCE(
               (SELECT count(*) FROM ${quotations} WHERE ${LIVE})::numeric
               / NULLIF((SELECT count(DISTINCT ${quotations.clientId}) FROM ${quotations} WHERE ${LIVE}), 0),
               0
             )::float AS avg_per_client
        FROM client_master_t c`),
  );

  const clients = rowsOf<QuotationClients['clients'][number]>(
    await db.execute(sql`
      SELECT c.id AS id,
             c.short_name AS short_name,
             c.company_name AS company_name,
             count(${quotations.id})::int AS total,
             COALESCE(sum(${quotations.totalAmount}), 0)::float AS value_usd,
             COALESCE(avg(${quotations.totalAmount}), 0)::float AS avg_usd,
             max(${qdate})::text AS last_quotation_date
        FROM client_master_t c
        JOIN ${quotations} ON ${quotations.clientId} = c.id AND ${LIVE}
       WHERE c.display = 'Y'
       GROUP BY c.id, c.short_name, c.company_name
       ORDER BY sum(${quotations.totalAmount}) DESC NULLS LAST`),
  );

  return {
    stats: stats ?? { total_clients: 0, with_quotations: 0, active_clients: 0, avg_per_client: 0 },
    clients,
  };
}

export interface QuotationClientDetail {
  id: number;
  short_name: string | null;
  company_name: string | null;
  client_type: string | null;
  contact_person: string | null;
  email: string | null;
  payment_term: string | null;
  display: string;
  total: number;
  value_usd: number;
  avg_usd: number;
  max_usd: number;
  lines: number;
  last_quotation_date: string | null;
  breakdowns: {
    kind: DistributionRow[];
    transport: DistributionRow[];
    goods: DistributionRow[];
    category: DistributionRow[];
  };
  recent: QuotationRow[];
}

/** One client's quotation profile, with the four breakdowns the panel shows. */
export async function getQuotationClientDetail(
  clientId: number,
): Promise<QuotationClientDetail | null> {
  const scoped: SQL = sql`${LIVE} AND ${quotations.clientId} = ${clientId}`;

  const [client] = rowsOf<Omit<QuotationClientDetail, 'breakdowns' | 'recent'>>(
    await db.execute(sql`
      SELECT c.id AS id,
             c.short_name AS short_name,
             c.company_name AS company_name,
             c.client_type AS client_type,
             c.contact_person AS contact_person,
             c.email AS email,
             c.payment_term AS payment_term,
             c.display AS display,
             (SELECT count(*) FROM ${quotations} WHERE ${scoped})::int AS total,
             COALESCE((SELECT sum(${quotations.totalAmount}) FROM ${quotations} WHERE ${scoped}), 0)::float
               AS value_usd,
             COALESCE((SELECT avg(${quotations.totalAmount}) FROM ${quotations} WHERE ${scoped}), 0)::float
               AS avg_usd,
             COALESCE((SELECT max(${quotations.totalAmount}) FROM ${quotations} WHERE ${scoped}), 0)::float
               AS max_usd,
             (SELECT count(*)::int FROM quotation_items_t i
               WHERE i.display = 'Y'
                 AND EXISTS (SELECT 1 FROM ${quotations} WHERE ${quotations.id} = i.quotation_id AND ${scoped})
             ) AS lines,
             (SELECT max(${qdate})::text FROM ${quotations} WHERE ${scoped}) AS last_quotation_date
        FROM client_master_t c
       WHERE c.id = ${clientId} AND c.display = 'Y'`),
  );
  if (!client) return null;

  const scopedDistribution = async (
    table: string,
    labelColumn: string,
    fk: SQL,
  ): Promise<DistributionRow[]> =>
    rowsOf<DistributionRow>(
      await db.execute(sql`
        SELECT COALESCE(m.${sql.identifier(labelColumn)}, 'Not Specified') AS label,
               count(*)::int AS count,
               COALESCE(sum(${quotations.totalAmount}), 0)::float AS value_usd
          FROM ${quotations}
          LEFT JOIN ${sql.identifier(table)} m ON m.id = ${fk} AND m.display = 'Y'
         WHERE ${scoped}
         GROUP BY COALESCE(m.${sql.identifier(labelColumn)}, 'Not Specified')
         ORDER BY count(*) DESC`),
    );

  const [kind, transport, goods, category, recent] = await Promise.all([
    scopedDistribution('kind_master_t', 'kind_name', sql`${quotations.kindId}`),
    scopedDistribution('transport_mode_master_t', 'transport_mode_name', sql`${quotations.transportModeId}`),
    scopedDistribution('type_of_goods_master_t', 'goods_type', sql`${quotations.goodsTypeId}`),
    db
      .execute(sql`
        SELECT COALESCE(cat.category_name, 'Uncategorised') AS label,
               count(*)::int AS count,
               COALESCE(sum(i.total_usd), 0)::float AS value_usd
          FROM quotation_items_t i
          LEFT JOIN quotation_category_master_t cat ON cat.id = i.category_id
         WHERE i.display = 'Y'
           AND EXISTS (SELECT 1 FROM ${quotations} WHERE ${quotations.id} = i.quotation_id AND ${scoped})
         GROUP BY COALESCE(cat.category_name, 'Uncategorised')
         ORDER BY count(*) DESC`)
      .then((r) => rowsOf<DistributionRow>(r)),
    db
      .execute(sql`
        ${QUOTATION_SELECT} AND ${quotations.clientId} = ${clientId}
         ORDER BY ${quotations.createdAt} DESC LIMIT 10`)
      .then((r) => rowsOf<QuotationRow>(r)),
  ]);

  return { ...client, breakdowns: { kind, transport, goods, category }, recent };
}
