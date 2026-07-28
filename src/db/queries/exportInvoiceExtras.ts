// §2 step 5 — Export Invoice list/stat/DGI helpers. Ports the legacy
// ExportInvoiceController getStatistics / listInvoices / getDgiInfo / updateDgiInfo.
// "DGI info complete" = a DGI code + a positive amount + a normalizer are all
// present; a validated (=1) invoice that becomes DGI-complete is promoted to DGI
// Verified (=2), matching main. MCA files link via export_invoice_mca_details_t
// (not a CSV like imports).
import { eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportInvoices } from '@/db/schema';

const N = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// dgi_code + dgi_amount + normalized_by all present ⇒ DGI info complete.
const DGI_COMPLETE = sql`(inv.dgi_code IS NOT NULL AND inv.dgi_code <> '' AND inv.dgi_amount > 0 AND inv.normalized_by IS NOT NULL AND inv.normalized_by > 0)`;

export interface ExportInvoiceStats {
  total: number;
  validated: number;
  not_validated: number;
  dgi_verified: number;
  dgi_info_done: number;
  dgi_info_pending: number;
  pending_invoicing: number; // export MCA files with quittance, not yet invoiced
}

export async function exportInvoiceStats(): Promise<ExportInvoiceStats> {
  const inv = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE validated = 1)::int AS validated,
      count(*) FILTER (WHERE validated = 0)::int AS not_validated,
      count(*) FILTER (WHERE validated = 2)::int AS dgi_verified,
      count(*) FILTER (WHERE validated = 2)::int AS dgi_info_done,
      count(*) FILTER (WHERE validated = 1 AND NOT ${DGI_COMPLETE})::int AS dgi_info_pending
    FROM ${exportInvoices} inv
    WHERE inv.display = 'Y'`);

  // Pending for invoicing: export MCA files with a quittance that no invoice has
  // consumed yet (export_invoice_mca_details_t links them by mca_id).
  const pend = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM exports_t e
    WHERE e.display = 'Y'
      AND e.quittance_date IS NOT NULL
      AND e.id NOT IN (
        SELECT DISTINCT mca_id FROM export_invoice_mca_details_t WHERE mca_id IS NOT NULL
      )`);

  const r = (inv as unknown as { rows: Record<string, number>[] }).rows[0] ?? {};
  const p = (pend as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0;
  return {
    total: N(r.total),
    validated: N(r.validated),
    not_validated: N(r.not_validated),
    dgi_verified: N(r.dgi_verified),
    dgi_info_done: N(r.dgi_info_done),
    dgi_info_pending: N(r.dgi_info_pending),
    pending_invoicing: N(p),
  };
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------
export type ExportInvoiceFilter =
  | 'all'
  | 'validated'
  | 'not-validated'
  | 'dgi-verified'
  | 'dgi-info-done'
  | 'dgi-info-pending';

export interface ExportInvoiceListRow {
  id: number;
  invoice_ref: string | null;
  client_id: number | null;
  client_name: string | null;
  mca_count: number;
  type_of_goods: string | null;
  encoded_by: string | null;
  created_at: string | null;
  validated: number;
  dgi_code: string | null;
  dgi_amount: number;
  normalized_by: number | null;
}

export interface ExportInvoiceListParams {
  q?: string;
  filter?: ExportInvoiceFilter;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}

function filterCondition(filter?: ExportInvoiceFilter): SQL | null {
  switch (filter) {
    case 'validated':
      return sql`inv.validated = 1`;
    case 'not-validated':
      return sql`inv.validated = 0`;
    case 'dgi-verified':
    case 'dgi-info-done':
      return sql`inv.validated = 2`;
    case 'dgi-info-pending':
      return sql`(inv.validated = 1 AND NOT ${DGI_COMPLETE})`;
    default:
      return null;
  }
}

export async function listExportInvoices(
  p: ExportInvoiceListParams,
): Promise<{ items: ExportInvoiceListRow[]; total: number }> {
  const conds: SQL[] = [sql`inv.display = 'Y'`];
  const fc = filterCondition(p.filter);
  if (fc) conds.push(fc);
  if (p.q?.trim()) {
    const like = `%${p.q.trim()}%`;
    conds.push(sql`(inv.invoice_ref ILIKE ${like} OR c.short_name ILIKE ${like} OR c.company_name ILIKE ${like} OR tg.goods_type ILIKE ${like} OR u.full_name ILIKE ${like})`);
  }
  if (p.dateFrom) conds.push(sql`inv.created_at::date >= ${p.dateFrom}`);
  if (p.dateTo) conds.push(sql`inv.created_at::date <= ${p.dateTo}`);
  const where = sql.join(conds, sql` AND `);

  const from = sql`
    FROM export_invoices_t inv
    LEFT JOIN client_master_t c ON c.id = inv.client_id
    LEFT JOIN type_of_goods_master_t tg ON tg.id = inv.goods_type_id
    LEFT JOIN users_t u ON u.id = inv.created_by
    WHERE ${where}`;

  const rows = await db.execute(sql`
    SELECT inv.id, inv.invoice_ref, inv.client_id, c.short_name AS client_name,
           (SELECT count(*) FROM export_invoice_mca_details_t d WHERE d.export_invoice_id = inv.id)::int AS mca_count,
           tg.goods_type AS type_of_goods,
           COALESCE(u.full_name, u.username) AS encoded_by,
           to_char(inv.created_at, 'YYYY-MM-DD') AS created_at,
           inv.validated, inv.dgi_code, inv.dgi_amount, inv.normalized_by
    ${from}
    ORDER BY inv.id DESC
    LIMIT ${p.pageSize} OFFSET ${(p.page - 1) * p.pageSize}`);

  const countRes = await db.execute(sql`SELECT count(*)::int AS total ${from}`);

  const list = (rows as unknown as { rows: Record<string, unknown>[] }).rows.map((r) => ({
    id: r.id as number,
    invoice_ref: (r.invoice_ref as string) ?? null,
    client_id: (r.client_id as number) ?? null,
    client_name: (r.client_name as string) ?? null,
    mca_count: N(r.mca_count),
    type_of_goods: (r.type_of_goods as string) ?? null,
    encoded_by: (r.encoded_by as string) ?? null,
    created_at: (r.created_at as string) ?? null,
    validated: N(r.validated),
    dgi_code: (r.dgi_code as string) ?? null,
    dgi_amount: N(r.dgi_amount),
    normalized_by: (r.normalized_by as number) ?? null,
  }));
  const total = (countRes as unknown as { rows: { total: number }[] }).rows[0]?.total ?? 0;
  return { items: list, total: N(total) };
}

// ---------------------------------------------------------------------------
// DGI EDIT (dgi_code / dgi_amount / normalized_by; auto-verify on completion)
// ---------------------------------------------------------------------------
export async function updateExportDgiInfo(
  id: number,
  input: { dgi_code: string | null; dgi_amount: number; normalized_by: number | null },
  uid: number,
): Promise<{ found: boolean; verified: boolean }> {
  const [existing] = await db
    .select({ id: exportInvoices.id, validated: exportInvoices.validated })
    .from(exportInvoices)
    .where(eq(exportInvoices.id, id));
  if (!existing) return { found: false, verified: false };

  const complete =
    !!input.dgi_code && input.dgi_code.trim() !== '' && input.dgi_amount > 0 && !!input.normalized_by && input.normalized_by > 0;
  const verify = complete && existing.validated === 1;

  await db.execute(sql`
    UPDATE export_invoices_t SET
      dgi_code = ${input.dgi_code},
      dgi_amount = ${input.dgi_amount},
      normalized_by = ${input.normalized_by},
      validated = CASE WHEN ${verify} THEN 2 ELSE validated END,
      updated_by = ${uid},
      updated_at = now()
    WHERE id = ${id}`);
  return { found: true, verified: verify };
}
