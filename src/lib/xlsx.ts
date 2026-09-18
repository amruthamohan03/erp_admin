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
  /**
   * Header cell fill as ARGB, for a sheet whose headers are colour-coded by
   * what the column holds (the quotation summary's text vs money columns).
   * Defaults to the shared header colour.
   */
  headerFill?: string;
  /** Excel number format for the body cells, e.g. an accounting format. */
  numFmt?: string;
  /** Horizontal alignment of the body cells. Defaults to Excel's own. */
  align?: 'left' | 'center' | 'right';
  /** Bold body cells — a Total column. */
  bold?: boolean;
}

/** Excel's accounting format with a leading $ — negatives in brackets, zero as a dash. */
export const XLSX_USD_ACCOUNTING = '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"??_);_(@_)';

/**
 * A row's background, as one of a few named tones rather than a raw colour.
 *
 * Named because the point is the MEANING, not the paint: a licence expiring
 * inside 30 days is orange on the screen and orange in the spreadsheet, and the
 * two must not drift apart because somebody typed a different hex in one of
 * them. A caller says what the row IS; this module decides what that looks like
 * — the same reasoning as §4.20's action colours.
 */
export type XlsxRowTone = 'danger' | 'warning' | 'success' | 'muted';

/** Solid ARGB fills, chosen to stay readable behind black text when printed. */
const ROW_TONE_FILL: Record<XlsxRowTone, string> = {
  danger: 'FFF8D7DA', // red — expired
  warning: 'FFFFE5CC', // orange — expiring within the renewal window
  success: 'FFD4EDDA', // green — active
  muted: 'FFEFEFEF', // grey — everything with no state worth flagging
};

export interface XlsxSheet {
  name: string;
  columns: XlsxColumn[];
  rows: Array<Record<string, unknown>>;
  /** Optional bold totals row, keyed by column key (e.g. { mca_ref: 'TOTAL', weight: 123 }). */
  totalsRow?: Record<string, unknown>;
  /**
   * Per-row shading. Returns a tone, or null to leave the row unpainted.
   *
   * Given the row object rather than an index so the rule reads as a fact about
   * the record ("this licence has expired") instead of about its position.
   */
  rowTone?: (row: Record<string, unknown>) => XlsxRowTone | null;
  /** Thin black borders on every cell, header included. */
  borders?: boolean;
  /** Header row height in points (default 24). */
  headerHeight?: number;
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

    // Per-column body styling. Set on the COLUMN, so every row added below —
    // data and totals alike — inherits it without a second loop. BEFORE the
    // header is styled: a column style also rewrites the header cell that
    // already exists, and would otherwise strip its white bold font.
    s.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.numFmt) col.numFmt = c.numFmt;
      if (c.align) col.alignment = { horizontal: c.align };
      if (c.bold) col.font = { bold: true };
    });

    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    header.height = s.headerHeight ?? 24;
    header.eachCell((cell, colNumber) => {
      const argb = s.columns[colNumber - 1]?.headerFill ?? 'FF667EEA';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    });

    for (const r of s.rows) {
      const added = ws.addRow(r);
      const tone = s.rowTone?.(r) ?? null;
      if (tone) {
        const argb = ROW_TONE_FILL[tone];
        // Painted cell by cell, not on the row: a row-level fill in ExcelJS only
        // covers cells that already exist, so a record with a trailing empty
        // column would end in an unpainted gap mid-stripe.
        added.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
        });
      }
    }

    if (s.totalsRow) {
      const tr = ws.addRow(s.totalsRow);
      tr.font = { bold: true };
      tr.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
      });
    }

    if (s.borders && s.columns.length > 0) {
      const thin = { style: 'thin' as const, color: { argb: 'FF000000' } };
      ws.eachRow({ includeEmpty: false }, (row) => {
        for (let c = 1; c <= s.columns.length; c += 1) {
          row.getCell(c).border = { top: thin, left: thin, bottom: thin, right: thin };
        }
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
