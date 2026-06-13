// Excel (.xlsx) builder shared by the export download routes. Wraps exceljs so
// route handlers describe sheets declaratively (columns + rows, optional totals)
// and never touch the workbook API directly. Mirrors csv.ts ergonomics
// (xlsxResponse / dateStamp) so the two output paths feel the same.
//
// Runs in the Node.js runtime (exceljs is not edge-compatible). Route handlers
// using this are server-only and Node by default.
import ExcelJS from 'exceljs';

export interface XlsxColumn {
  key: string;
  header: string;
  width?: number;
}

export interface XlsxSheet {
  name: string;
  columns: XlsxColumn[];
  rows: Array<Record<string, unknown>>;
  /** Optional bold totals row, keyed by column key (e.g. { mca_ref: 'TOTAL', weight: 123 }). */
  totalsRow?: Record<string, unknown>;
}

// Excel sheet names: max 31 chars, none of \ / ? * [ ] :
export function sanitizeSheetName(name: string): string {
  const cleaned = (name || 'Sheet').replace(/[\\/?*[\]:]/g, '-').trim();
  return cleaned.slice(0, 31) || 'Sheet';
}

export async function buildXlsx(sheets: XlsxSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  // Excel rejects a workbook with zero sheets — always emit at least an empty one.
  const list = sheets.length > 0 ? sheets : [{ name: 'Sheet1', columns: [], rows: [] }];

  // Sheet names must be unique within a workbook; de-dupe with a numeric suffix.
  const used = new Set<string>();
  for (const s of list) {
    let name = sanitizeSheetName(s.name);
    if (used.has(name.toLowerCase())) {
      let i = 2;
      while (used.has(`${name.slice(0, 28)}-${i}`.toLowerCase())) i += 1;
      name = `${name.slice(0, 28)}-${i}`;
    }
    used.add(name.toLowerCase());

    const ws = wb.addWorksheet(name);
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));

    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    header.height = 24;
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } };
    });

    for (const r of s.rows) ws.addRow(r);

    if (s.totalsRow) {
      const tr = ws.addRow(s.totalsRow);
      tr.font = { bold: true };
      tr.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
      });
    }

    if (s.columns.length > 0) {
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

export function xlsxResponse(buf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export function dateStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
