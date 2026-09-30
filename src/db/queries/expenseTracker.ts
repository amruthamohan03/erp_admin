import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { loadPaymentStages } from '@/db/queries/paymentStages';
import { paymentStatusSql } from '@/db/queries/payments';
import { fileProfit, summarise, type FileProfit } from '@/lib/expenseTracker/profit';

// §4.29 — the expense tracker: what each consignment cost, what it was billed,
// and the difference.
//
// Every figure is a SQL aggregate over live rows (never a client-side sum of one
// page), and the two sides come from different places:
//
//   SPEND    payment_request_t.mca_data — `[{ mca_ref, amount }]`, so the
//            per-file split already exists and nothing has to be apportioned.
//            Paid vs pending is `paymentStatusSql`, the SAME walk the payments
//            grid and its badges use (§4.10) — this screen cannot disagree with
//            that one about whether a request is paid.
//
//   INVOICE  no per-file amount exists anywhere. An import invoice stores a CSV
//            of file ids and one total; an export invoice has per-file rows that
//            carry liquidation and weight, not a billed amount. So an invoice is
//            divided EQUALLY across the files it covers. That keeps the sum over
//            all files equal to the real invoiced amount — no revenue invented,
//            none lost — and `invoice_count`/`shared_invoice` let the screen say
//            a figure is a share rather than a direct bill.
//
// Local tracking has no invoice table at all, so a local file shows spend and no
// revenue. That is a fact about the data, not a gap here.

export interface ExpenseTrackerRow extends FileProfit {
  module: 'import' | 'export' | 'local';
  file_id: number;
  mca_ref: string;
  client_name: string | null;
  clearing_status: string | null;
  file_date: string | null;
  /** How many payment requests touched this file (any status but rejected). */
  request_count: number;
  /** How many invoices cover this file. */
  invoice_count: number;
  /** True when at least one of those invoices also covers another file. */
  shared_invoice: boolean;
}

export interface ExpenseTrackerResult {
  items: ExpenseTrackerRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: ReturnType<typeof summarise>;
}

export interface ExpenseTrackerFilters {
  module?: 'import' | 'export' | 'local' | 'all';
  clientId?: number | null;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  /** 'profit' | 'loss' | 'uninvoiced' — narrow to what needs attention. */
  outcome?: 'all' | 'profit' | 'loss' | 'uninvoiced';
  page: number;
  pageSize: number;
}

const N = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The files, one row per consignment across all three tracking modules.
 *
 * Soft-deleted rows are excluded (§4.27). A file with no reference is excluded
 * too — spend attaches by reference, so a file without one cannot carry any,
 * and listing it would only ever show zeroes.
 */
function filesCte(): SQL {
  return sql`
    SELECT 'import'::text AS module, i.id AS file_id, i.mca_ref AS mca_ref,
           i.client_id, i.clearing_status, i.created_at
      FROM imports_t i
     WHERE i.display = 'Y' AND NULLIF(TRIM(i.mca_ref), '') IS NOT NULL
    UNION ALL
    SELECT 'export'::text, e.id, e.mca_ref, e.client_id, e.clearing_status, e.created_at
      FROM exports_t e
     WHERE e.display = 'Y' AND NULLIF(TRIM(e.mca_ref), '') IS NOT NULL
    UNION ALL
    SELECT 'local'::text, l.id, l.mca_lt_reference, l.client_id, l.clearing_status, l.created_at
      FROM locals_t l
     WHERE l.display = 'Y' AND NULLIF(TRIM(l.mca_lt_reference), '') IS NOT NULL`;
}

/**
 * Spend per file, split by whether the money has actually left.
 *
 * Keyed by MODULE AND REFERENCE, never by reference alone. A reference is not
 * unique across the three tracking tables — this database has three that exist
 * in both `imports_t` and `exports_t` — so a reference-only join credits the
 * same payment to two files and doubles the spend on both. `pay_for` is what
 * resolves it: the request already records which module it was raised against.
 *
 * `pay_for` 3 (Other) and 4 (Pre Payment) map to no module and are therefore
 * NOT attributed to any file. That is what those values mean — neither is spend
 * against a consignment — and it is the same reason the payments module skips
 * the tracking cross-check for them.
 *
 * NON-USD REQUESTS ARE COUNTED, NEVER CONVERTED. There is no exchange rate that
 * is right for an arbitrary currency on an arbitrary past date, and inventing
 * one produces a profit figure that looks precise and is wrong. The row carries
 * the count so the screen can mark the figure as incomplete (§4.23's honesty
 * applied to a number rather than a message).
 */
function spendCte(statusSql: SQL): SQL {
  return sql`
    SELECT CASE pr.pay_for WHEN 0 THEN 'import' WHEN 1 THEN 'export' WHEN 2 THEN 'local' END AS module,
           TRIM(line->>'mca_ref') AS mca_ref,
           COALESCE(SUM((line->>'amount')::numeric)
             FILTER (WHERE ${statusSql} = 'paid' AND cu.currency_short_name = 'USD'), 0) AS paid_spend,
           COALESCE(SUM((line->>'amount')::numeric)
             FILTER (WHERE ${statusSql} LIKE 'waiting%' AND cu.currency_short_name = 'USD'), 0) AS pending_spend,
           COUNT(*) FILTER (WHERE ${statusSql} <> 'rejected'
                              AND COALESCE(cu.currency_short_name, '') <> 'USD') AS other_currency_spend_count,
           COUNT(DISTINCT pr.id) FILTER (WHERE ${statusSql} <> 'rejected') AS request_count
      FROM payment_request_t pr
      LEFT JOIN currency_master_t cu ON cu.id = pr.currency
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(pr.mca_data, '[]'::jsonb)) AS line
     WHERE pr.display = 'Y'
       AND NULLIF(TRIM(line->>'mca_ref'), '') IS NOT NULL
       AND pr.pay_for IN (0, 1, 2)
     GROUP BY 1, 2`;
}

/**
 * Each file's share of the invoices covering it.
 *
 * Import: `mca_ids` is a CSV of imports_t ids, so it is split and each id takes
 * `calculated_total_amount / (number of ids)`.
 *
 * Export: the invoice has no total column of its own — it is the sum of its
 * items — and `export_invoice_mca_details_t` names the files, so each detail row
 * takes an equal share of that sum.
 *
 * Soft-deleted invoices are excluded: a withdrawn invoice is not revenue.
 */
function invoiceCte(): SQL {
  return sql`
    -- Import: CSV of file ids, one header total.
    SELECT 'import'::text AS module,
           f.file_id::int AS file_id,
           SUM(ii.calculated_total_amount / GREATEST(f.file_count, 1)) AS invoiced,
           COUNT(*)::int AS invoice_count,
           BOOL_OR(f.file_count > 1) AS shared_invoice
      FROM import_invoices_t ii
      CROSS JOIN LATERAL (
        SELECT NULLIF(TRIM(part), '')::int AS file_id,
               COUNT(*) OVER () AS file_count
          FROM UNNEST(STRING_TO_ARRAY(COALESCE(ii.mca_ids, ''), ',')) AS part
         WHERE NULLIF(TRIM(part), '') IS NOT NULL
      ) f
     WHERE ii.display = 'Y'
     GROUP BY 1, 2

    UNION ALL

    -- Export: total is the sum of the invoice's items; files come from the
    -- detail table.
    SELECT 'export'::text,
           d.mca_id::int,
           SUM(t.total / GREATEST(t.file_count, 1)),
           COUNT(*)::int,
           BOOL_OR(t.file_count > 1)
      FROM export_invoice_mca_details_t d
      JOIN export_invoices_t ei ON ei.id = d.export_invoice_id AND ei.display = 'Y'
      CROSS JOIN LATERAL (
        SELECT COALESCE((SELECT SUM(it.total_usd) FROM export_invoice_items_t it
                          WHERE it.export_invoice_id = ei.id), 0) AS total,
               (SELECT COUNT(*) FROM export_invoice_mca_details_t d2
                 WHERE d2.export_invoice_id = ei.id) AS file_count
      ) t
     WHERE d.mca_id IS NOT NULL
     GROUP BY 1, 2`;
}

export async function getExpenseTracker(
  f: ExpenseTrackerFilters,
): Promise<ExpenseTrackerResult> {
  // The configured approval chain, so 'paid' here is what the payments module
  // means by paid — including any stage an operator has switched off.
  const stages = await loadPaymentStages();
  const statusSql = paymentStatusSql(stages, 'pr');

  const conds: SQL[] = [];
  if (f.module && f.module !== 'all') conds.push(sql`fl.module = ${f.module}`);
  if (f.clientId) conds.push(sql`fl.client_id = ${f.clientId}`);
  if (f.from) conds.push(sql`fl.created_at >= ${f.from}::date`);
  // Inclusive of the end day — a range typed as 01–31 must contain the 31st.
  if (f.to) conds.push(sql`fl.created_at < (${f.to}::date + INTERVAL '1 day')`);
  if (f.q?.trim()) {
    const like = `%${f.q.trim()}%`;
    // §4.15 — the reference AND the client code, because both are on screen and
    // an operator must be able to type what they can see.
    conds.push(sql`(fl.mca_ref ILIKE ${like} OR cm.short_name ILIKE ${like})`);
  }

  // The outcome filter reads the JOINED aggregates, which is legal in the outer
  // WHERE because spend and invoiced are joins rather than groupings — so it
  // goes in the same list as everything else. Building it as a separate
  // fragment and appending it was how this grew a dangling `AND TRUE` on the
  // unfiltered case: two `sql` templates are never `===`, so the "is it empty"
  // test was always false.
  if (f.outcome === 'profit') {
    conds.push(sql`(COALESCE(iv.invoiced, 0) - COALESCE(sp.paid_spend, 0)) > 0`);
  } else if (f.outcome === 'loss') {
    conds.push(sql`(COALESCE(iv.invoiced, 0) - COALESCE(sp.paid_spend, 0)) < 0`);
  } else if (f.outcome === 'uninvoiced') {
    conds.push(sql`COALESCE(iv.invoiced, 0) = 0`);
  }

  const where = conds.length > 0 ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;

  const base = sql`
    WITH files AS (${filesCte()}),
         spend AS (${spendCte(statusSql)}),
         invoiced AS (${invoiceCte()})
    SELECT fl.module, fl.file_id, fl.mca_ref,
           cm.short_name AS client_name,
           cs.clearing_status AS clearing_status,
           to_char(fl.created_at, 'YYYY-MM-DD') AS file_date,
           COALESCE(sp.paid_spend, 0) AS paid_spend,
           COALESCE(sp.pending_spend, 0) AS pending_spend,
           COALESCE(sp.other_currency_spend_count, 0) AS other_currency_spend_count,
           COALESCE(sp.request_count, 0) AS request_count,
           COALESCE(iv.invoiced, 0) AS invoiced,
           COALESCE(iv.invoice_count, 0) AS invoice_count,
           COALESCE(iv.shared_invoice, false) AS shared_invoice
      FROM files fl
      LEFT JOIN client_master_t cm ON cm.id = fl.client_id
      LEFT JOIN clearing_status_master_t cs ON cs.id = fl.clearing_status
      LEFT JOIN spend sp ON sp.module = fl.module AND sp.mca_ref = TRIM(fl.mca_ref)
      LEFT JOIN invoiced iv ON iv.module = fl.module AND iv.file_id = fl.file_id
      ${where}`;

  // The filtered count, for the pagination footer.
  const countRows = await db.execute(sql`SELECT COUNT(*)::int AS total FROM (${base}) q`);
  const total = N((countRows as unknown as { rows: { total: number }[] }).rows[0]?.total);

  // The summary is over EVERY matching file, not the page — §4.29 is explicit
  // that a KPI is an aggregate over live data, never a sum of what is on screen.
  const sumRows = await db.execute(sql`
    SELECT COALESCE(SUM(paid_spend), 0) AS paid_spend,
           COALESCE(SUM(pending_spend), 0) AS pending_spend,
           COALESCE(SUM(invoiced), 0) AS invoiced,
           COALESCE(SUM(other_currency_spend_count), 0) AS other_currency_spend_count
      FROM (${base}) q`);
  const s = (sumRows as unknown as { rows: Record<string, unknown>[] }).rows[0] ?? {};

  const offset = (f.page - 1) * f.pageSize;
  const rows = await db.execute(sql`
    ${base}
    ORDER BY fl.created_at DESC NULLS LAST, fl.module, fl.file_id DESC
    LIMIT ${f.pageSize} OFFSET ${offset}`);

  const items: ExpenseTrackerRow[] = (
    rows as unknown as { rows: Record<string, unknown>[] }
  ).rows.map((r) => ({
    module: r.module as 'import' | 'export' | 'local',
    file_id: N(r.file_id),
    mca_ref: String(r.mca_ref ?? ''),
    client_name: (r.client_name as string) ?? null,
    clearing_status: (r.clearing_status as string) ?? null,
    file_date: (r.file_date as string) ?? null,
    request_count: N(r.request_count),
    invoice_count: N(r.invoice_count),
    shared_invoice: r.shared_invoice === true,
    // The profit arithmetic is the pure function's, not the query's (§4.10) —
    // the same one the tests cover and the summary uses.
    ...fileProfit({
      paid_spend: N(r.paid_spend),
      pending_spend: N(r.pending_spend),
      invoiced: N(r.invoiced),
      other_currency_spend_count: N(r.other_currency_spend_count),
    }),
  }));

  const summary = {
    ...fileProfit({
      paid_spend: N(s.paid_spend),
      pending_spend: N(s.pending_spend),
      invoiced: N(s.invoiced),
      other_currency_spend_count: N(s.other_currency_spend_count),
    }),
    files: total,
  };

  return { items, total, page: f.page, pageSize: f.pageSize, summary };
}
