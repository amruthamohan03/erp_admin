// POST /api/v1/sydonia/[kind]/validate  (kind = import | export)
//
// Multipart upload of the Sydonia Excel. Parsed server-side (exceljs — no client
// dependency): column A = MCA Ref, B–H = declaration/liquidation/quittance
// ref+date + amount.
//
// Every row comes back with a verdict, so the preview can tell the operator
// exactly which references will be updated and which cannot be — and WHY, since
// "not in the database", "in the Recycle Bin", "nothing to write" and "listed
// twice" are four different problems with four different fixes (§4.23).
//
// Columns B–H are coerced HERE, not at commit time, so the preview shows the
// value that will actually be written. A date the sheet spells oddly used to be
// dropped silently on save; now it is reported while the file can still be fixed.
import { type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { lookupMcaRefs } from '@/db/queries/sydonia';
import {
  classifyRow,
  normalizeRef,
  type RowStatus,
  type SydoniaKind,
  type SydoniaRow,
} from '@/lib/sydonia';

export const runtime = 'nodejs';

/** Matches the row cap on the update route, so a file cannot pass here and fail there. */
const MAX_ROWS = 5000;
const MAX_BYTES = 8 * 1024 * 1024;

function cellStr(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
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
    const kindParam = (await ctx.params).kind;
    if (kindParam !== 'import' && kindParam !== 'export') return fail('Invalid kind', 400);
    const kind = kindParam as SydoniaKind;

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail('No file was uploaded — choose an Excel file first.', 400);
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      return fail(`Only Excel files are accepted — "${file.name}" is not .xlsx or .xls.`, 415);
    }
    if (file.size > MAX_BYTES) {
      return fail(
        `The file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 8 MB. Split it and upload in parts.`,
        413,
      );
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return fail('The workbook has no sheets.', 422);

    const rows: Array<SydoniaRow & { excel_row: number }> = [];
    ws.eachRow((row, rowNumber) => {
      const mca = cellStr(row.getCell(1).value).trim();
      // Skip a header row (first cell says MCA/REF and isn't itself a reference).
      if (rowNumber === 1 && /MCA|REF/i.test(mca) && !/[/-]/.test(mca)) return;
      if (!mca) return;
      rows.push({
        excel_row: rowNumber,
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

    if (rows.length === 0) {
      return fail(
        'No data rows were found. Column A must hold the MCA reference of an existing record, one per row.',
        422,
      );
    }
    if (rows.length > MAX_ROWS) {
      return fail(
        `The file holds ${rows.length} rows — at most ${MAX_ROWS} can be processed at once. Split it and upload in parts.`,
        422,
      );
    }

    const found = await lookupMcaRefs(kind, rows.map((r) => r.mca_ref));

    const seen = new Set<string>();
    const validated = rows.map((r) => {
      const key = normalizeRef(r.mca_ref);
      const verdict = classifyRow(r, found.get(key), { kind, alreadySeen: seen.has(key) });
      seen.add(key);
      return { ...r, ...verdict };
    });

    const by = (s: RowStatus) => validated.filter((r) => r.status === s);
    const ready = by('ready');

    return ok({
      rows: validated,
      total: validated.length,
      // The two lists the screen leads with: what will be updated, and what cannot be.
      found_refs: ready.map((r) => r.mca_ref),
      blocked: validated
        .filter((r) => r.status !== 'ready')
        .map((r) => ({ mca_ref: r.mca_ref, excel_row: r.excel_row, status: r.status, reason: r.reason })),
      counts: {
        ready: ready.length,
        missing: by('missing').length,
        deleted: by('deleted').length,
        empty: by('empty').length,
        duplicate: by('duplicate').length,
        warnings: validated.filter((r) => r.warnings.length > 0).length,
      },
    });
  },
);
