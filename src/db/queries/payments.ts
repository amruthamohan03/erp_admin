// Payment Request queries (§7.4). The approval buckets mirror main's
// get_status_counts / get_list CASE logic exactly. Visibility and per-stage
// eligibility are config-driven via payment_stage_role_master_t (§4.7) — no
// hardcoded role ids.
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { PAYMENT_STAGES } from '@/db/schema';
import { STAGE_COLUMNS } from '@/lib/payments/stages';
import type { StageDef } from '@/lib/payments/stageConfig';
import { getRoleStageInfo, visibilitySql, type RoleStageInfo } from './paymentStages';

// Re-exported: every payment route already imports the role lookup from here.
export { getRoleStageInfo, type RoleStageInfo };

// ---- status buckets ------------------------------------------------------------

/** A column reference, qualified by `alias` when there is one. */
function col(alias: string | null, name: string): SQL {
  return alias ? sql`${sql.identifier(alias)}.${sql.identifier(name)}` : sql`${sql.identifier(name)}`;
}

/**
 * A request's status key, as SQL: `rejected`, `waiting_<stage>` or `paid`.
 *
 * The same walk `paymentStatus` makes in TypeScript — any rejection first, then
 * the first stage of the configured chain that applies to the row's payment type
 * and is not yet approved — built from the same StageDef list, so a card and the
 * badge it filters to cannot disagree (§4.10).
 *
 * The THEN literals are inlined rather than bound: a bound parameter in a CASE
 * branch has no type Postgres can infer. They come from the closed stage set, so
 * nothing operator-typed reaches `sql.raw`.
 */
export function paymentStatusSql(stages: readonly StageDef[], alias: string | null = 'pr'): SQL {
  const rejected = sql.join(
    PAYMENT_STAGES.map((s) => sql`${col(alias, STAGE_COLUMNS[s].approval)} = -1`),
    sql` OR `,
  );
  const whens = stages
    .filter((s) => (PAYMENT_STAGES as readonly string[]).includes(s.stage))
    .map((s) => {
      const applies = s.payment_type ? sql`${col(alias, 'payment_type')} = ${s.payment_type} AND ` : sql``;
      return sql`WHEN ${applies}${col(alias, STAGE_COLUMNS[s.stage].approval)} IS DISTINCT FROM 1 THEN ${sql.raw(`'waiting_${s.stage}'`)}`;
    });
  return sql`(CASE WHEN ${rejected} THEN 'rejected' ${sql.join(whens, sql` `)} ELSE 'paid' END)`;
}

function statusCond(filter: string, stages: readonly StageDef[]): SQL | null {
  if (!filter || filter === 'all') return null;
  return sql`${paymentStatusSql(stages)} = ${filter}`;
}

const JOINS = sql`
  FROM payment_request_t pr
  LEFT JOIN department_master_t d ON d.id = pr.department
  LEFT JOIN client_master_t c ON c.id = pr.client_id
  LEFT JOIN currency_master_t cu ON cu.id = pr.currency
  LEFT JOIN expense_type_master_t ex ON ex.id = pr.expense_type
  LEFT JOIN main_office_master_t mo ON mo.id = pr.location_id
`;

function whereClause(parts: SQL[]): SQL {
  return sql.join([sql`WHERE `, sql.join(parts, sql` AND `)]);
}

// ---- the shared filter set -------------------------------------------------

/**
 * Everything a caller may narrow the list by.
 *
 * ONE definition, because the grid and the Excel export must answer with the
 * same rows: an export of a filtered list that quietly ignores half the filters
 * is worse than no export, since nothing on the sheet says which rows are
 * missing (§4.15's reasoning about exports mirroring their list).
 *
 * `from` / `to` are the REQUEST date — `created_at`, the day the request was
 * raised — not an approval or payment date. That is what "requests made between
 * these dates" means to the person asking for the sheet.
 */
export interface PaymentFilters {
  status_filter?: string;
  q?: string;
  from?: string;
  to?: string;
  client_id?: number;
  department?: number;
  location_id?: number;
  pay_for?: number;
  payment_type?: string;
  currency?: number;
  expense_type?: number;
}

/**
 * Which filters narrow the rows, WITHOUT the status bucket.
 *
 * Split out because the stat cards need exactly this: each card counts one
 * status over the same date range and column filters the grid is showing. Fold
 * the status in and every card would count its own bucket intersected with the
 * bucket already selected, so picking "Rejected" would zero the other seven.
 */
function narrowingConditions(f: PaymentFilters): SQL[] {
  const parts: SQL[] = [];

  // Both bounds are INCLUSIVE days. `created_at` is a timestamp, so an
  // inclusive upper bound has to be `< to + 1 day` rather than `<= to` —
  // otherwise a request raised at 14:30 on the last day of the range falls
  // outside a range that names that day, which reads as lost data.
  if (f.from) parts.push(sql`pr.created_at >= ${f.from}::date`);
  if (f.to) parts.push(sql`pr.created_at < (${f.to}::date + INTERVAL '1 day')`);

  if (f.client_id != null) parts.push(sql`pr.client_id = ${f.client_id}`);
  if (f.department != null) parts.push(sql`pr.department = ${f.department}`);
  if (f.location_id != null) parts.push(sql`pr.location_id = ${f.location_id}`);
  if (f.pay_for != null) parts.push(sql`pr.pay_for = ${f.pay_for}`);
  if (f.payment_type) parts.push(sql`pr.payment_type = ${f.payment_type}`);
  if (f.currency != null) parts.push(sql`pr.currency = ${f.currency}`);
  if (f.expense_type != null) parts.push(sql`pr.expense_type = ${f.expense_type}`);

  if (f.q?.trim()) {
    const like = `%${f.q.trim()}%`;
    // `mca_data` is searched as text so an operator can find a request by a
    // reference printed on a document in front of them — the references are the
    // one identifier that travels outside this system, and they are not a
    // column. Both date spellings too, so typing the DD-MM-YYYY the Date column
    // shows finds the row that shows it (§4.19).
    parts.push(sql`(pr.beneficiary ILIKE ${like} OR pr.motif ILIKE ${like} OR pr.requestee ILIKE ${like}
      OR CAST(pr.id AS TEXT) ILIKE ${like} OR CAST(pr.amount AS TEXT) ILIKE ${like}
      OR COALESCE(pr.cash_collector,'') ILIKE ${like}
      OR COALESCE(pr.mca_data::text,'') ILIKE ${like}
      OR COALESCE(c.short_name,'') ILIKE ${like} OR COALESCE(c.company_name,'') ILIKE ${like}
      OR COALESCE(ex.expense_type_name,'') ILIKE ${like}
      OR COALESCE(pr.payment_type,'') ILIKE ${like} OR COALESCE(cu.currency_short_name,'') ILIKE ${like}
      OR to_char(pr.created_at, 'DD-MM-YYYY') ILIKE ${like}
      OR to_char(pr.created_at, 'YYYY-MM-DD') ILIKE ${like})`);
  }

  return parts;
}

function filterConditions(f: PaymentFilters, stages: readonly StageDef[]): SQL[] {
  const parts = narrowingConditions(f);
  const sc = statusCond(f.status_filter ?? 'all', stages);
  if (sc) parts.push(sc);
  return parts;
}

// ---- status counts (one per configured bucket + total) ------------------------

/** `total`, `paid`, `rejected`, and `waiting_<stage>` for every active stage. */
export type PaymentStatusCounts = Record<string, number>;

/**
 * The eight card figures, over the SAME rows the grid is showing.
 *
 * The filters matter here and were the defect: the cards used to count every
 * request the role could see, whatever date range or column filter the grid had
 * applied. So a list narrowed to March showed March's rows under counts for the
 * whole year, and clicking a card that read "12 Rejected" produced three rows
 * with nothing on screen to explain the difference.
 *
 * The status bucket itself is excluded (`narrowingConditions`, not
 * `filterConditions`) — each card counts its own bucket, so folding in the
 * selected one would zero the other seven the moment a card was clicked.
 */
export async function getStatusCounts(
  roleInfo: RoleStageInfo,
  userId: number,
  stages: readonly StageDef[],
  filters: PaymentFilters = {},
): Promise<PaymentStatusCounts> {
  const where = whereClause([visibilitySql(roleInfo, userId), ...narrowingConditions(filters)]);
  const res = await db.execute(sql`
    SELECT st, COUNT(*)::int AS n FROM (
      SELECT ${paymentStatusSql(stages)} AS st ${JOINS} ${where}
    ) x GROUP BY st
  `);
  // Every configured bucket is present, at zero when empty, so a card reads 0
  // rather than blank.
  const counts: PaymentStatusCounts = { total: 0, paid: 0, rejected: 0 };
  for (const s of stages) counts[`waiting_${s.stage}`] = 0;
  for (const r of (res as unknown as { rows: { st: string; n: number }[] }).rows) {
    counts[r.st] = (counts[r.st] ?? 0) + r.n;
    counts.total += r.n;
  }
  return counts;
}

// ---- list (joined, filtered, paginated) -------------------------------------

export interface PaymentListRow {
  id: number;
  requestee: string;
  beneficiary: string | null;
  client_name: string | null;
  pay_for: number | null;
  payment_type: string | null;
  currency_short_name: string | null;
  expense_type_name: string | null;
  amount: string;
  mca_count: number;
  created_at: string;
  created_by: number | null;
  /** How many times a rejection sent this back to be corrected (0094). */
  resubmit_count: number;
  department_name: string | null;
  location_id: number | null;
  location_name: string | null;
  dept_approval: number | null;
  finance_approval: number | null;
  management_approval: number | null;
  under_process: number | null;
  paid_approval: number | null;
}

export async function listPayments(
  roleInfo: RoleStageInfo,
  userId: number,
  stages: readonly StageDef[],
  filters: PaymentFilters,
  limit: number,
  offset: number,
): Promise<{ items: PaymentListRow[]; total: number }> {
  const where = whereClause([visibilitySql(roleInfo, userId), ...filterConditions(filters, stages)]);

  const countRes = await db.execute(sql`SELECT COUNT(*)::int AS total ${JOINS} ${where}`);
  const total = (countRes as unknown as { rows: { total: number }[] }).rows[0]?.total ?? 0;

  const res = await db.execute(sql`
    SELECT pr.id, pr.requestee, pr.beneficiary, pr.pay_for, pr.payment_type, pr.amount,
           pr.created_at, pr.created_by, pr.resubmit_count, pr.location_id,
           pr.dept_approval, pr.finance_approval, pr.management_approval, pr.under_process, pr.paid_approval,
           d.department_name, mo.main_location_name AS location_name,
           c.short_name AS client_name, cu.currency_short_name, ex.expense_type_name,
           COALESCE(jsonb_array_length(pr.mca_data), 0)::int AS mca_count
    ${JOINS} ${where}
    ORDER BY pr.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  const items = (res as unknown as { rows: PaymentListRow[] }).rows;
  return { items, total };
}

// ---- export (same filters, every column, no paging) -------------------------

/** A row as the spreadsheet needs it: names resolved, no ids a reader can't use. */
export interface PaymentExportRow extends PaymentListRow {
  motif: string | null;
  cash_collector: string | null;
  chargeback: string | null;
  mca_refs: string | null;
  dept_approved_at: string | null;
  dept_approved_by_name: string | null;
  dept_notes: string | null;
  finance_approved_at: string | null;
  finance_approved_by_name: string | null;
  finance_notes: string | null;
  management_approved_at: string | null;
  management_approved_by_name: string | null;
  management_notes: string | null;
  under_process_at: string | null;
  under_process_by_name: string | null;
  under_process_notes: string | null;
  paid_approved_at: string | null;
  paid_approved_by_name: string | null;
  paid_notes: string | null;
  resubmitted_at: string | null;
  created_by_name: string | null;
}

/**
 * Every row the given filters select, for the Excel export.
 *
 * Deliberately NOT paginated — an export of page 3 of 40 is not an export — but
 * capped, because an unbounded query behind a download link is a way to take the
 * server down with one click. The cap is generous enough that a year of requests
 * fits, and the route says so when it is hit rather than silently truncating.
 *
 * Carries the approval trail (who, when, and what they wrote) because that is
 * the half of a payment request that a spreadsheet is usually being asked for.
 */
export async function exportPayments(
  roleInfo: RoleStageInfo,
  userId: number,
  stages: readonly StageDef[],
  filters: PaymentFilters,
  limit: number,
): Promise<PaymentExportRow[]> {
  const where = whereClause([visibilitySql(roleInfo, userId), ...filterConditions(filters, stages)]);
  const res = await db.execute(sql`
    SELECT pr.id, pr.requestee, pr.beneficiary, pr.pay_for, pr.payment_type, pr.amount,
           pr.created_at, pr.created_by, pr.resubmit_count, pr.resubmitted_at,
           pr.motif, pr.cash_collector, pr.chargeback,
           pr.dept_approval, pr.finance_approval, pr.management_approval, pr.under_process, pr.paid_approval,
           pr.dept_approved_at, pr.dept_notes,
           pr.finance_approved_at, pr.finance_notes,
           pr.management_approved_at, pr.management_notes,
           pr.under_process_at, pr.under_process_notes,
           pr.paid_approved_at, pr.paid_notes,
           d.department_name, mo.main_location_name AS location_name,
           c.short_name AS client_name, cu.currency_short_name, ex.expense_type_name,
           COALESCE(jsonb_array_length(pr.mca_data), 0)::int AS mca_count,
           -- The references as one cell. A spreadsheet row is one request, so the
           -- lines are joined rather than exploded into extra rows that would
           -- repeat every other column and break the totals.
           (SELECT string_agg(l->>'mca_ref', ', ' ORDER BY ord)
              FROM jsonb_array_elements(COALESCE(pr.mca_data, '[]'::jsonb)) WITH ORDINALITY AS t(l, ord)
           ) AS mca_refs,
           uc.full_name AS created_by_name,
           u1.full_name AS dept_approved_by_name,
           u2.full_name AS finance_approved_by_name,
           u3.full_name AS management_approved_by_name,
           u4.full_name AS under_process_by_name,
           u5.full_name AS paid_approved_by_name
    ${JOINS}
    LEFT JOIN users_t uc ON uc.id = pr.created_by
    LEFT JOIN users_t u1 ON u1.id = pr.dept_approved_by
    LEFT JOIN users_t u2 ON u2.id = pr.finance_approved_by
    LEFT JOIN users_t u3 ON u3.id = pr.management_approved_by
    LEFT JOIN users_t u4 ON u4.id = pr.under_process_by
    LEFT JOIN users_t u5 ON u5.id = pr.paid_approved_by
    ${where}
    ORDER BY pr.id DESC
    LIMIT ${limit}
  `);
  return (res as unknown as { rows: PaymentExportRow[] }).rows;
}

// ---- single (full detail with joined names + approver names) ----------------

export async function getPaymentDetail(id: number): Promise<Record<string, unknown> | null> {
  const res = await db.execute(sql`
    SELECT pr.*,
           d.department_name, c.short_name AS client_name, cu.currency_short_name,
           mo.main_location_name AS location_name, ex.expense_type_name,
           u1.full_name AS dept_approved_by_name,
           u2.full_name AS finance_approved_by_name,
           u3.full_name AS management_approved_by_name,
           u4.full_name AS under_process_by_name,
           u5.full_name AS paid_approved_by_name,
           uc.full_name AS created_by_name,
           -- The four attachments' original names, so the viewer can show
           -- "Document 1 (.pdf)" — the columns hold files_t ids as text.
           f1.original_name AS file1_name, f2.original_name AS file2_name,
           f3.original_name AS file3_name, f4.original_name AS file4_name
    FROM payment_request_t pr
    LEFT JOIN department_master_t d ON d.id = pr.department
    LEFT JOIN client_master_t c ON c.id = pr.client_id
    LEFT JOIN currency_master_t cu ON cu.id = pr.currency
    LEFT JOIN main_office_master_t mo ON mo.id = pr.location_id
    LEFT JOIN expense_type_master_t ex ON ex.id = pr.expense_type
    LEFT JOIN users_t u1 ON u1.id = pr.dept_approved_by
    LEFT JOIN users_t u2 ON u2.id = pr.finance_approved_by
    LEFT JOIN users_t u3 ON u3.id = pr.management_approved_by
    LEFT JOIN users_t u4 ON u4.id = pr.under_process_by
    LEFT JOIN users_t u5 ON u5.id = pr.paid_approved_by
    LEFT JOIN users_t uc ON uc.id = pr.created_by
    LEFT JOIN files_t f1 ON f1.id::text = pr.file1_path
    LEFT JOIN files_t f2 ON f2.id::text = pr.file2_path
    LEFT JOIN files_t f3 ON f3.id::text = pr.file3_path
    LEFT JOIN files_t f4 ON f4.id::text = pr.file4_path
    WHERE pr.id = ${id} LIMIT 1
  `);
  const rows = (res as unknown as { rows: Record<string, unknown>[] }).rows;
  return rows[0] ?? null;
}

// ---- dashboard aggregates ----------------------------------------------------

export interface PaymentDashboard {
  kpi: {
    total_payments: number; total_amount: number; paid: number; rejected: number;
    pending: number; today: number; this_week: number; this_month: number; this_year: number;
  };
  /** One row per status present, labelled and toned from the stage master. */
  status_cards: Array<{ status_key: string; status_name: string; tone: string; count: number }>;
  monthly: Array<{ month_name: string; total: number; revenue: number }>;
  top_clients: Array<{ company_name: string; total: number; revenue: number }>;
}

export async function getPaymentDashboard(stages: readonly StageDef[]): Promise<PaymentDashboard> {
  // One status definition for the whole dashboard — the same CASE the list's
  // cards count with, so "Paid 12" here is "Paid 12" there.
  const status = paymentStatusSql(stages, null);
  const kpiRes = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_payments,
      COALESCE(SUM(amount),0)::float AS total_amount,
      COALESCE(SUM(CASE WHEN ${status} = 'paid' THEN 1 ELSE 0 END), 0)::int AS paid,
      COALESCE(SUM(CASE WHEN ${status} = 'rejected' THEN 1 ELSE 0 END), 0)::int AS rejected,
      COALESCE(SUM(CASE WHEN ${status} LIKE 'waiting_%' THEN 1 ELSE 0 END), 0)::int AS pending,
      SUM(CASE WHEN created_at::date = current_date THEN 1 ELSE 0 END)::int AS today,
      SUM(CASE WHEN date_trunc('week', created_at) = date_trunc('week', current_date) THEN 1 ELSE 0 END)::int AS this_week,
      SUM(CASE WHEN date_trunc('month', created_at) = date_trunc('month', current_date) THEN 1 ELSE 0 END)::int AS this_month,
      SUM(CASE WHEN date_trunc('year', created_at) = date_trunc('year', current_date) THEN 1 ELSE 0 END)::int AS this_year
    FROM payment_request_t
  `);
  const kpi = (kpiRes as unknown as { rows: PaymentDashboard['kpi'][] }).rows[0];

  // Status breakdown — keys from SQL, names and hues from the stage master.
  const statusRes = await db.execute(sql`
    SELECT st, COUNT(*)::int AS count FROM (SELECT ${status} AS st FROM payment_request_t WHERE display = 'Y') s
    GROUP BY st ORDER BY count DESC
  `);
  const last = stages.at(-1);
  const status_cards = (statusRes as unknown as { rows: { st: string; count: number }[] }).rows.map((r) => {
    const def = stages.find((d) => `waiting_${d.stage}` === r.st);
    if (def) return { status_key: r.st, status_name: def.pending_label, tone: def.tone, count: r.count };
    if (r.st === 'rejected') return { status_key: r.st, status_name: 'Rejected', tone: 'rose', count: r.count };
    return { status_key: r.st, status_name: last?.label ?? 'Completed', tone: 'emerald', count: r.count };
  });

  const monthlyRes = await db.execute(sql`
    SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS month_name,
           COUNT(*)::int AS total, COALESCE(SUM(amount),0)::float AS revenue
    FROM payment_request_t
    GROUP BY date_trunc('month', created_at)
    ORDER BY date_trunc('month', created_at)
  `);
  const monthly = (monthlyRes as unknown as { rows: PaymentDashboard['monthly'] }).rows;

  const topRes = await db.execute(sql`
    SELECT COALESCE(c.company_name, 'Unknown') AS company_name,
           COUNT(p.id)::int AS total, COALESCE(SUM(p.amount),0)::float AS revenue
    FROM payment_request_t p
    LEFT JOIN client_master_t c ON c.id = p.client_id
    GROUP BY c.company_name
    ORDER BY revenue DESC
    LIMIT 10
  `);
  const top_clients = (topRes as unknown as { rows: PaymentDashboard['top_clients'] }).rows;

  return {
    kpi: kpi ?? { total_payments: 0, total_amount: 0, paid: 0, rejected: 0, pending: 0, today: 0, this_week: 0, this_month: 0, this_year: 0 },
    status_cards,
    monthly,
    top_clients,
  };
}
