// §2 step 5 — Import Invoice list/stat/DGI helpers. Ports the legacy
// ImportInvoiceController getStatistics / listInvoices / getNormalizers /
// updateDGIInfo. "DGI complete" = a DGI code + a positive amount + a normalizer
// are all present; a validated (=1) invoice that becomes DGI-complete is promoted
// to DGI-verified (=2), matching main.
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importInvoices, usersT } from '@/db/schema';

const N = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// tally_ref + dgi_amount + normalized_by all present ⇒ DGI info complete.
const DGI_COMPLETE = sql`(inv.tally_ref IS NOT NULL AND inv.tally_ref <> '' AND inv.dgi_amount > 0 AND inv.normalized_by IS NOT NULL AND inv.normalized_by > 0)`;

export interface ImportInvoiceStats {
  total: number;
  validated: number;
  not_validated: number;
  dgi_verified: number;
  dgi_complete: number;
  dgi_incomplete: number;
  pending_invoicing: number; // MCA files with quittance, not yet on any invoice
}

export async function importInvoiceStats(): Promise<ImportInvoiceStats> {
  const inv = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE validated = 1)::int AS validated,
      count(*) FILTER (WHERE validated = 0)::int AS not_validated,
      count(*) FILTER (WHERE validated = 2 OR ${DGI_COMPLETE})::int AS dgi_verified,
      count(*) FILTER (WHERE ${DGI_COMPLETE})::int AS dgi_complete,
      count(*) FILTER (WHERE NOT ${DGI_COMPLETE})::int AS dgi_incomplete
    FROM ${importInvoices} inv
    WHERE inv.display = 'Y'`);

  // Pending for invoicing: cleared MCA files (quittance issued, not cancelled,
  // importable kind, not export-disabled) that no invoice has consumed yet.
  const pend = await db.execute(sql`
    SELECT count(DISTINCT i.id)::int AS n
    FROM imports_t i
    WHERE i.display = 'Y'
      AND i.quittance_date IS NOT NULL
      AND (i.clearing_status IS NULL OR i.clearing_status <> 4)
      AND i.kind IN (1, 2, 5, 6)
      AND (i.inv_export_disabled = false OR i.inv_export_disabled IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM import_invoices_t x
        WHERE x.display = 'Y' AND x.mca_ids IS NOT NULL AND x.mca_ids <> ''
          AND (',' || x.mca_ids || ',') LIKE ('%,' || i.id || ',%')
      )`);

  const r = (inv as unknown as { rows: Record<string, number>[] }).rows[0] ?? {};
  const p = (pend as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0;
  return {
    total: N(r.total),
    validated: N(r.validated),
    not_validated: N(r.not_validated),
    dgi_verified: N(r.dgi_verified),
    dgi_complete: N(r.dgi_complete),
    dgi_incomplete: N(r.dgi_incomplete),
    pending_invoicing: N(p),
  };
}

// ---------------------------------------------------------------------------
// LIST (DGI-aware)
// ---------------------------------------------------------------------------
export type ImportInvoiceFilter =
  | 'all'
  | 'validated'
  | 'not-validated'
  | 'dgi-verified'
  | 'dgi-complete'
  | 'dgi-incomplete';

export interface ImportInvoiceListRow {
  id: number;
  invoice_ref: string | null;
  client_id: number | null;
  client_name: string | null;
  type_of_goods: string | null;
  created_at: string | null;
  created_by_name: string | null;
  amount: number;
  validated: number;
  tally_ref: string | null;
  dgi_amount: number;
  normalized_by: number | null;
}

export interface ImportInvoiceListParams {
  q?: string;
  filter?: ImportInvoiceFilter;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}

function filterCondition(filter?: ImportInvoiceFilter): SQL | null {
  switch (filter) {
    case 'validated':
      return sql`inv.validated = 1`;
    case 'not-validated':
      return sql`inv.validated = 0`;
    case 'dgi-verified':
      return sql`(inv.validated = 2 OR ${DGI_COMPLETE})`;
    case 'dgi-complete':
      return sql`${DGI_COMPLETE}`;
    case 'dgi-incomplete':
      return sql`NOT ${DGI_COMPLETE}`;
    default:
      return null;
  }
}

export async function listImportInvoices(
  p: ImportInvoiceListParams,
): Promise<{ items: ImportInvoiceListRow[]; total: number }> {
  const conds: SQL[] = [sql`inv.display = 'Y'`];
  const fc = filterCondition(p.filter);
  if (fc) conds.push(fc);
  if (p.q?.trim()) {
    const like = `%${p.q.trim()}%`;
    conds.push(sql`(inv.invoice_ref ILIKE ${like} OR inv.mca_ids ILIKE ${like} OR c.short_name ILIKE ${like} OR u.username ILIKE ${like} OR tg.goods_type ILIKE ${like})`);
  }
  if (p.dateFrom) conds.push(sql`inv.created_at::date >= ${p.dateFrom}`);
  if (p.dateTo) conds.push(sql`inv.created_at::date <= ${p.dateTo}`);
  const where = sql.join(conds, sql` AND `);

  const from = sql`
    FROM import_invoices_t inv
    LEFT JOIN client_master_t c ON c.id = inv.client_id
    LEFT JOIN type_of_goods_master_t tg ON tg.id = inv.goods_type_id
    LEFT JOIN users_t u ON u.id = inv.created_by
    WHERE ${where}`;

  const rows = await db.execute(sql`
    SELECT inv.id, inv.invoice_ref, inv.client_id,
           c.short_name AS client_name, tg.goods_type AS type_of_goods,
           to_char(inv.created_at, 'YYYY-MM-DD') AS created_at,
           u.full_name AS created_by_name,
           COALESCE(inv.calculated_total_amount, inv.cif_usd, 0) AS amount,
           inv.validated, inv.tally_ref, inv.dgi_amount, inv.normalized_by
    ${from}
    ORDER BY inv.created_at DESC, inv.id DESC
    LIMIT ${p.pageSize} OFFSET ${(p.page - 1) * p.pageSize}`);

  const countRes = await db.execute(sql`SELECT count(*)::int AS total ${from}`);

  const list = (rows as unknown as { rows: Record<string, unknown>[] }).rows.map((r) => ({
    id: r.id as number,
    invoice_ref: (r.invoice_ref as string) ?? null,
    client_id: (r.client_id as number) ?? null,
    client_name: (r.client_name as string) ?? null,
    type_of_goods: (r.type_of_goods as string) ?? null,
    created_at: (r.created_at as string) ?? null,
    created_by_name: (r.created_by_name as string) ?? null,
    amount: N(r.amount),
    validated: N(r.validated),
    tally_ref: (r.tally_ref as string) ?? null,
    dgi_amount: N(r.dgi_amount),
    normalized_by: (r.normalized_by as number) ?? null,
  }));
  const total = (countRes as unknown as { rows: { total: number }[] }).rows[0]?.total ?? 0;
  return { items: list, total: N(total) };
}

// ---------------------------------------------------------------------------
// NORMALIZERS (users who can normalise — main filters dept_id = 3)
// ---------------------------------------------------------------------------
export async function normalizers(): Promise<{ id: number; full_name: string }[]> {
  const rows = await db
    .select({ id: usersT.id, full_name: usersT.fullName })
    .from(usersT)
    .where(and(eq(usersT.deptId, '3'), eq(usersT.display, 'Y')))
    .orderBy(usersT.fullName);
  return rows.map((r) => ({ id: r.id, full_name: r.full_name ?? `User #${r.id}` }));
}

// ---------------------------------------------------------------------------
// DGI EDIT
// ---------------------------------------------------------------------------
export async function updateDgiInfo(
  id: number,
  input: { tally_ref: string | null; dgi_amount: number; normalized_by: number | null },
  uid: number,
): Promise<{ found: boolean }> {
  const [existing] = await db
    .select({ id: importInvoices.id })
    .from(importInvoices)
    .where(eq(importInvoices.id, id));
  if (!existing) return { found: false };

  const complete =
    !!input.tally_ref && input.tally_ref.trim() !== '' && input.dgi_amount > 0 && !!input.normalized_by && input.normalized_by > 0;

  await db.execute(sql`
    UPDATE import_invoices_t SET
      tally_ref = ${input.tally_ref},
      dgi_amount = ${input.dgi_amount},
      normalized_by = ${input.normalized_by},
      validated = CASE WHEN ${complete} AND validated = 1 THEN 2 ELSE validated END,
      updated_by = ${uid},
      updated_at = now()
    WHERE id = ${id}`);
  return { found: true };
}
