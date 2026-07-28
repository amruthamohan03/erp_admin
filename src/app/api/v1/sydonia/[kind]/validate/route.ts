// POST /api/v1/sydonia/[kind]/validate  (kind = import | export)
// Multipart upload of the Sydonia Excel. Parsed server-side (exceljs — no client
// dependency): column A = MCA Ref, B–H = declaration/liquidation/quittance
// ref+date + amount. Returns each parsed row flagged `valid` (its MCA ref exists
// in imports_t/exports_t) so the UI can preview before committing.
import { type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { existingMcaRefs, type SydoniaKind, type SydoniaRow } from '@/db/queries/sydonia';

export const runtime = 'nodejs';

function cellStr(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join('');
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    return '';
  }
  return String(v).trim();
}

export const POST = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ kind: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const kind = (await ctx.params).kind;
    if (kind !== 'import' && kind !== 'export') return fail('Invalid kind', 400);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail('No file uploaded', 400);
    if (!/\.(xlsx|xls)$/i.test(file.name)) return fail('Only Excel (.xlsx/.xls) files are allowed', 415);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return fail('The workbook has no sheets', 422);

    const rows: SydoniaRow[] = [];
    ws.eachRow((row, rowNumber) => {
      const mca = cellStr(row.getCell(1).value).trim();
      // Skip a header row (first cell says MCA/REF and isn't itself a reference).
      if (rowNumber === 1 && /MCA|REF/i.test(mca) && !/[/-]/.test(mca)) return;
      if (!mca) return;
      rows.push({
        mca_ref: mca,
        declaration_reference: cellStr(row.getCell(2).value).trim(),
        declaration_date: cellStr(row.getCell(3).value).trim(),
        liquidation_reference: cellStr(row.getCell(4).value).trim(),
        liquidation_date: cellStr(row.getCell(5).value).trim(),
        quittance_reference: cellStr(row.getCell(6).value).trim(),
        quittance_date: cellStr(row.getCell(7).value).trim(),
        liquidation_amount: cellStr(row.getCell(8).value).trim(),
      });
    });

    if (rows.length === 0) return fail('No data rows found — column A must hold MCA references', 422);

    const existing = await existingMcaRefs(kind as SydoniaKind, rows.map((r) => r.mca_ref));
    const flagged = rows.map((r) => ({ ...r, valid: existing.has(r.mca_ref.trim().toUpperCase()) }));

    return ok({
      rows: flagged,
      total: flagged.length,
      valid_count: flagged.filter((r) => r.valid).length,
      invalid_count: flagged.filter((r) => !r.valid).length,
    });
  },
);
