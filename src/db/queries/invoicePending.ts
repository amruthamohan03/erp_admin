// §2 step 5 — "Pending for invoicing": cleared tracking files no live invoice
// carries yet, per kind. Ports main's pending modal (getPendingMCAs /
// toggleExportDisable / exportPendingToExcel) for both invoice modules.
//
// One rule feeds the stat card, the modal and its spreadsheet, built from the
// SAME fragments the grid's file picker uses (invoices.ts), so a file counted
// as pending is always one the operator can actually pick.
//
// A file can be held back ("disabled") with a reason — it stays listed, flagged,
// and drops out of the count; the spreadsheet lists it on its own sheet.
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, type XlsxColumn } from '@/lib/xlsx';
import { formatDate } from '@/lib/formatDate';
import {
  EXPORT_FILE_CLEARED,
  IMPORT_FILE_CLEARED,
  exportFileNotInvoiced,
  importFileNotInvoiced,
  type InvoiceKind,
} from './invoices';

const N = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface PendingFile {
  id: number;
  mca_ref: string | null;
  client_id: number | null;
  client_code: string | null;
  client_name: string | null;
  quittance_date: string | null;
  weight: number;
  fob: number;
  disabled: boolean;
  remark: string | null;
}

/** Table, alias and "still pending" predicate per kind. Import only invoices its
 *  own consignment kinds (definitive / temporary / under value / hand carry) —
 *  the rule the pending count has always applied. */
function scope(kind: InvoiceKind): { from: SQL; pending: SQL; alias: SQL } {
  return kind === 'export'
    ? {
        from: sql`exports_t e`,
        alias: sql`e`,
        pending: sql`${EXPORT_FILE_CLEARED} AND ${exportFileNotInvoiced()}`,
      }
    : {
        from: sql`imports_t i`,
        alias: sql`i`,
        pending: sql`${IMPORT_FILE_CLEARED} AND i.kind IN (1, 2, 5, 6) AND ${importFileNotInvoiced()}`,
      };
}

const NOT_DISABLED = (a: SQL): SQL => sql`(${a}.inv_export_disabled = false OR ${a}.inv_export_disabled IS NULL)`;

/** The stat-card figure: pending files that are not held back. */
export async function pendingInvoiceCount(kind: InvoiceKind): Promise<number> {
  const s = scope(kind);
  const res = await db.execute(sql`
    SELECT count(*)::int AS n FROM ${s.from} WHERE ${s.pending} AND ${NOT_DISABLED(s.alias)}`);
  return N((res as unknown as { rows: { n: number }[] }).rows[0]?.n);
}

/** Every pending file, held-back ones included (flagged), client by client. */
export async function pendingInvoiceFiles(kind: InvoiceKind): Promise<PendingFile[]> {
  const s = scope(kind);
  const res = await db.execute(sql`
    SELECT ${s.alias}.id, ${s.alias}.mca_ref, ${s.alias}.client_id,
           c.short_name AS client_code, c.company_name AS client_name,
           to_char(${s.alias}.quittance_date, 'YYYY-MM-DD') AS quittance_date,
           ${s.alias}.weight, ${s.alias}.fob,
           COALESCE(${s.alias}.inv_export_disabled, false) AS disabled,
           ${s.alias}.inv_export_disabled_remark AS remark
    FROM ${s.from}
    LEFT JOIN client_master_t c ON c.id = ${s.alias}.client_id
    WHERE ${s.pending}
    ORDER BY c.short_name NULLS LAST, ${s.alias}.quittance_date, ${s.alias}.id`);
  return (res as unknown as { rows: Record<string, unknown>[] }).rows.map((r) => ({
    id: Number(r.id),
    mca_ref: (r.mca_ref as string) ?? null,
    client_id: r.client_id == null ? null : Number(r.client_id),
    client_code: (r.client_code as string) ?? null,
    client_name: (r.client_name as string) ?? null,
    quittance_date: (r.quittance_date as string) ?? null,
    weight: N(r.weight),
    fob: N(r.fob),
    disabled: r.disabled === true,
    remark: (r.remark as string) ?? null,
  }));
}

/**
 * The pending list as a workbook: the files still to invoice, then the held-back
 * ones on their own "Dossiers Désactivés" sheet with the reason. The client
 * cells carry the legal name — the file leaves the office (§4.15).
 */
export async function buildPendingInvoiceXlsx(kind: InvoiceKind): Promise<Buffer> {
  const files = await pendingInvoiceFiles(kind);
  const weightUnit = kind === 'export' ? 'Weight (MT)' : 'Weight (KG)';
  const base: XlsxColumn[] = [
    { key: 'n', header: '#', width: 6, align: 'center' },
    { key: 'client_code', header: 'Client Code', width: 12 },
    { key: 'client_name', header: 'Client', width: 36 },
    { key: 'mca_ref', header: 'MCA Reference', width: 24 },
    { key: 'quittance_date', header: 'Quittance Date', width: 15, align: 'center' },
    { key: 'weight', header: weightUnit, width: 14, numFmt: '#,##0.00', align: 'right' },
    { key: 'fob', header: 'FOB (USD)', width: 14, numFmt: '#,##0.00', align: 'right' },
  ];
  const toRows = (list: PendingFile[]): Array<Record<string, unknown>> =>
    list.map((f, i) => ({
      n: i + 1,
      client_code: f.client_code ?? '',
      client_name: f.client_name ?? '',
      mca_ref: f.mca_ref ?? '',
      quittance_date: formatDate(f.quittance_date, ''),
      weight: f.weight,
      fob: f.fob,
      remark: f.remark ?? '',
    }));
  const active = files.filter((f) => !f.disabled);
  const held = files.filter((f) => f.disabled);
  const total = (list: PendingFile[]): Record<string, unknown> => ({
    mca_ref: `TOTAL — ${list.length} file(s)`,
    weight: list.reduce((s, f) => s + f.weight, 0),
    fob: list.reduce((s, f) => s + f.fob, 0),
  });
  return buildXlsx([
    { name: 'Pending Invoicing', columns: base, rows: toRows(active), totalsRow: total(active), borders: true },
    {
      name: 'Dossiers Désactivés',
      columns: [...base, { key: 'remark', header: 'Reason', width: 48 }],
      rows: toRows(held),
      totalsRow: total(held),
      borders: true,
    },
  ]);
}

/**
 * Hold a pending file back from invoicing (with the reason) or release it.
 * Only a file that is still pending can be toggled — an invoiced or uncleared
 * file is not this screen's business. Audited against the tracking file.
 */
export async function setPendingFileDisabled(
  kind: InvoiceKind,
  id: number,
  disabled: boolean,
  remark: string | null,
  uid: number,
): Promise<{ found: boolean; mca_ref: string | null }> {
  const s = scope(kind);
  return db.transaction(async (tx) => {
    const cur = await tx.execute(sql`
      SELECT ${s.alias}.mca_ref,
             COALESCE(${s.alias}.inv_export_disabled, false) AS disabled,
             ${s.alias}.inv_export_disabled_remark AS remark
      FROM ${s.from}
      WHERE ${s.alias}.id = ${id} AND ${s.pending}
      FOR UPDATE OF ${s.alias}`);
    const row = (cur as unknown as { rows: { mca_ref: string | null; disabled: boolean; remark: string | null }[] }).rows[0];
    if (!row) return { found: false, mca_ref: null };

    const nextRemark = disabled ? remark : null;
    await tx.execute(sql`
      UPDATE ${sql.identifier(kind === 'export' ? 'exports_t' : 'imports_t')}
      SET inv_export_disabled = ${disabled}, inv_export_disabled_remark = ${nextRemark},
          updated_by = ${uid}, updated_at = now()
      WHERE id = ${id}`);

    await recordAudit(tx, {
      actorId: uid,
      action: 'update',
      // The tracking pages' own audit type, so the change shows in that file's history.
      entityType: kind === 'export' ? 'page:export' : 'page:import',
      entityId: id,
      before: { inv_export_disabled: row.disabled, inv_export_disabled_remark: row.remark },
      after: { inv_export_disabled: disabled, inv_export_disabled_remark: nextRemark },
      metadata: { mca_ref: row.mca_ref, via: `${kind}-invoices/pending` },
    });
    return { found: true, mca_ref: row.mca_ref };
  });
}
