// Payment Request queries (§7.4). The approval buckets mirror main's
// get_status_counts / get_list CASE logic exactly. Visibility and per-stage
// eligibility are config-driven via payment_stage_role_master_t (§4.7) — no
// hardcoded role ids.
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentStageRole, type PaymentStage } from '@/db/schema';

// ---- role → stage config -----------------------------------------------------

export interface RoleStageInfo {
  stages: Set<PaymentStage>;
  // A role mapped to any stage is an "approver" and sees every request.
  isApprover: boolean;
}

export async function getRoleStageInfo(roleId: number): Promise<RoleStageInfo> {
  const rows = await db
    .select({ stage: paymentStageRole.stage })
    .from(paymentStageRole)
    .where(sql`${paymentStageRole.roleId} = ${roleId} AND ${paymentStageRole.display} = 'Y'`);
  const stages = new Set(rows.map((r) => r.stage as PaymentStage));
  return { stages, isApprover: stages.size > 0 };
}

// Visibility: approvers see all; everyone else only what they created.
function visibilityCond(roleInfo: RoleStageInfo, userId: number): SQL {
  return roleInfo.isApprover ? sql`TRUE` : sql`pr.created_by = ${userId}`;
}

// ---- status bucket fragments (against the `pr` alias) ------------------------

const REJECTED = sql`(pr.dept_approval = -1 OR pr.finance_approval = -1 OR pr.management_approval = -1 OR pr.under_process = -1 OR pr.paid_approval = -1)`;

function statusCond(filter: string): SQL | null {
  switch (filter) {
    case 'waiting_dept':
      return sql`(pr.dept_approval IS NULL AND COALESCE(pr.finance_approval,0) <> -1 AND COALESCE(pr.management_approval,0) <> -1 AND COALESCE(pr.under_process,0) <> -1 AND COALESCE(pr.paid_approval,0) <> -1)`;
    case 'waiting_finance':
      return sql`(pr.dept_approval=1 AND pr.finance_approval IS NULL AND COALESCE(pr.management_approval,0) <> -1 AND COALESCE(pr.under_process,0) <> -1 AND COALESCE(pr.paid_approval,0) <> -1)`;
    case 'waiting_mgmt':
      return sql`(pr.dept_approval=1 AND pr.finance_approval=1 AND pr.management_approval IS NULL AND COALESCE(pr.under_process,0) <> -1 AND COALESCE(pr.paid_approval,0) <> -1)`;
    case 'waiting_under_process':
      return sql`(pr.payment_type='Bank' AND pr.dept_approval=1 AND pr.finance_approval=1 AND pr.management_approval=1 AND pr.under_process IS NULL AND COALESCE(pr.paid_approval,0) <> -1)`;
    case 'waiting_payment':
      return sql`(((pr.payment_type='Cash' AND pr.dept_approval=1 AND pr.finance_approval=1 AND pr.management_approval=1) OR (pr.payment_type='Bank' AND pr.dept_approval=1 AND pr.finance_approval=1 AND pr.management_approval=1 AND pr.under_process=1)) AND pr.paid_approval IS NULL)`;
    case 'paid':
      return sql`pr.paid_approval=1`;
    case 'rejected':
      return REJECTED;
    default:
      return null; // 'all'
  }
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

// ---- status counts (7 buckets + total) --------------------------------------

export interface PaymentStatusCounts {
  total: number;
  waiting_dept: number;
  waiting_finance: number;
  waiting_mgmt: number;
  waiting_under_process: number;
  waiting_payment: number;
  paid: number;
  rejected: number;
}

export async function getStatusCounts(roleInfo: RoleStageInfo, userId: number): Promise<PaymentStatusCounts> {
  const vis = visibilityCond(roleInfo, userId);
  const res = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN ${statusCond('waiting_dept')} THEN 1 ELSE 0 END)::int AS waiting_dept,
      SUM(CASE WHEN ${statusCond('waiting_finance')} THEN 1 ELSE 0 END)::int AS waiting_finance,
      SUM(CASE WHEN ${statusCond('waiting_mgmt')} THEN 1 ELSE 0 END)::int AS waiting_mgmt,
      SUM(CASE WHEN ${statusCond('waiting_under_process')} THEN 1 ELSE 0 END)::int AS waiting_under_process,
      SUM(CASE WHEN ${statusCond('waiting_payment')} THEN 1 ELSE 0 END)::int AS waiting_payment,
      SUM(CASE WHEN pr.paid_approval=1 THEN 1 ELSE 0 END)::int AS paid,
      SUM(CASE WHEN ${REJECTED} THEN 1 ELSE 0 END)::int AS rejected
    FROM payment_request_t pr
    WHERE ${vis}
  `);
  const row = (res as unknown as { rows: PaymentStatusCounts[] }).rows[0];
  return row ?? { total: 0, waiting_dept: 0, waiting_finance: 0, waiting_mgmt: 0, waiting_under_process: 0, waiting_payment: 0, paid: 0, rejected: 0 };
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
  department_name: string | null;
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
  filter: string,
  q: string | undefined,
  limit: number,
  offset: number,
): Promise<{ items: PaymentListRow[]; total: number }> {
  const parts: SQL[] = [visibilityCond(roleInfo, userId)];
  const sc = statusCond(filter);
  if (sc) parts.push(sc);
  if (q?.trim()) {
    const like = `%${q.trim()}%`;
    parts.push(sql`(pr.beneficiary ILIKE ${like} OR pr.motif ILIKE ${like} OR pr.requestee ILIKE ${like}
      OR CAST(pr.id AS TEXT) ILIKE ${like} OR CAST(pr.amount AS TEXT) ILIKE ${like}
      OR COALESCE(c.short_name,'') ILIKE ${like} OR COALESCE(ex.expense_type_name,'') ILIKE ${like}
      OR COALESCE(pr.payment_type,'') ILIKE ${like} OR COALESCE(cu.currency_short_name,'') ILIKE ${like})`);
  }
  const where = whereClause(parts);

  const countRes = await db.execute(sql`SELECT COUNT(*)::int AS total ${JOINS} ${where}`);
  const total = (countRes as unknown as { rows: { total: number }[] }).rows[0]?.total ?? 0;

  const res = await db.execute(sql`
    SELECT pr.id, pr.requestee, pr.beneficiary, pr.pay_for, pr.payment_type, pr.amount,
           pr.created_at, pr.created_by,
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
           u5.full_name AS paid_approved_by_name
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
  status_cards: Array<{ status_name: string; count: number }>;
  monthly: Array<{ month_name: string; total: number; revenue: number }>;
  top_clients: Array<{ company_name: string; total: number; revenue: number }>;
}

export async function getPaymentDashboard(): Promise<PaymentDashboard> {
  const kpiRes = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_payments,
      COALESCE(SUM(amount),0)::float AS total_amount,
      SUM(CASE WHEN paid_approval=1 THEN 1 ELSE 0 END)::int AS paid,
      SUM(CASE WHEN dept_approval=-1 OR finance_approval=-1 OR management_approval=-1 OR under_process=-1 OR paid_approval=-1 THEN 1 ELSE 0 END)::int AS rejected,
      SUM(CASE WHEN paid_approval IS NULL AND NOT (dept_approval=-1 OR finance_approval=-1 OR management_approval=-1 OR under_process=-1 OR paid_approval=-1) THEN 1 ELSE 0 END)::int AS pending,
      SUM(CASE WHEN created_at::date = current_date THEN 1 ELSE 0 END)::int AS today,
      SUM(CASE WHEN date_trunc('week', created_at) = date_trunc('week', current_date) THEN 1 ELSE 0 END)::int AS this_week,
      SUM(CASE WHEN date_trunc('month', created_at) = date_trunc('month', current_date) THEN 1 ELSE 0 END)::int AS this_month,
      SUM(CASE WHEN date_trunc('year', created_at) = date_trunc('year', current_date) THEN 1 ELSE 0 END)::int AS this_year
    FROM payment_request_t
  `);
  const kpi = (kpiRes as unknown as { rows: PaymentDashboard['kpi'][] }).rows[0];

  // Status breakdown by derived label.
  const statusRes = await db.execute(sql`
    SELECT label AS status_name, COUNT(*)::int AS count FROM (
      SELECT CASE
        WHEN dept_approval=-1 OR finance_approval=-1 OR management_approval=-1 OR under_process=-1 OR paid_approval=-1 THEN 'Rejected'
        WHEN paid_approval=1 THEN 'Paid'
        WHEN payment_type='Bank' AND management_approval=1 AND under_process=1 THEN 'Under Process'
        WHEN dept_approval=1 AND finance_approval=1 AND management_approval=1 THEN 'Pending Payment'
        WHEN dept_approval=1 AND finance_approval=1 THEN 'Pending Mgmt'
        WHEN dept_approval=1 THEN 'Pending Finance'
        ELSE 'Pending Dept' END AS label
      FROM payment_request_t
    ) s GROUP BY label ORDER BY count DESC
  `);
  const status_cards = (statusRes as unknown as { rows: PaymentDashboard['status_cards'] }).rows;

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
