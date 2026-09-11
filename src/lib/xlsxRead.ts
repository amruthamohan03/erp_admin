// Reading the other way: turn an uploaded .xlsx into rows.
//
// The twin of [xlsx.ts](src/lib/xlsx.ts), which only writes. Same library
// (exceljs, already a dependency — no new one, §12) and the same Node-runtime
// constraint, so callers are server-only route handlers.
//
// Parsing happens on the SERVER rather than in the browser on purpose. The
// reference implementation reads the workbook client-side and then makes one
// HTTP round trip PER reference to validate it — fifty references is fifty
// requests. Sending the file once and returning parsed rows lets the existing
// batch validator do the rest in one more call.
import ExcelJS from 'exceljs';

/** One parsed line: whatever was in the reference column, plus its amount. */
export interface SheetLine {
  ref: string;
  amount: number;
}

export interface ParsedSheet {
  lines: SheetLine[];
  /** Rows dropped because the reference cell was empty. */
  blank: number;
  /** Rows dropped because the same reference appeared earlier in the file. */
  duplicates: number;
  /** True when the first row looked like headers and was skipped. */
  headerSkipped: boolean;
}

/**
 * Does this row name its columns rather than hold data?
 *
 * Operators export from half a dozen places, so the file may or may not carry a
 * header. Sniffing it beats demanding one: guessing wrong in this direction
 * costs one row, demanding one costs every import that lacks it.
 */
function looksLikeHeader(cells: string[]): boolean {
  return cells.some((c) => /\b(mca|reference|ref|amount|montant)\b/i.test(c));
}

/** A cell as trimmed text, whatever exceljs made of it. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    // A formula cell carries its computed `result`; a rich-text cell carries runs.
    const o = value as { result?: unknown; richText?: Array<{ text: string }>; text?: string };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('').trim();
    if (o.result !== undefined && o.result !== null) return String(o.result).trim();
    if (typeof o.text === 'string') return o.text.trim();
    return '';
  }
  return String(value).trim();
}

/**
 * A number from a cell that may be text.
 *
 * Spreadsheets hand back `1 234,56` (French grouping, comma decimal) as often as
 * `1234.56` — this is a DRC operation and both reach the same column. Spaces and
 * thin spaces go, and a comma becomes the decimal point when there is no dot.
 */
function cellNumber(value: ExcelJS.CellValue): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let s = cellText(value).replace(/[\s  ]/g, '');
  if (s === '') return 0;
  if (!s.includes('.') && s.includes(',')) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse the first worksheet: column A is the reference, column B the amount.
 *
 * Positional, like the reference implementation — the files operators paste
 * together have no reliable header names, and asking them to rename columns is
 * a worse trade than fixing the order.
 */
export async function parseRefSheet(buffer: ArrayBuffer): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const sheet = wb.worksheets[0];
  if (!sheet) return { lines: [], blank: 0, duplicates: 0, headerSkipped: false };

  const lines: SheetLine[] = [];
  const seen = new Set<string>();
  let blank = 0;
  let duplicates = 0;
  let headerSkipped = false;
  let first = true;

  sheet.eachRow({ includeEmpty: false }, (row) => {
    const refCell = row.getCell(1).value;
    const amountCell = row.getCell(2).value;
    const ref = cellText(refCell);

    if (first) {
      first = false;
      if (looksLikeHeader([ref, cellText(amountCell)])) {
        headerSkipped = true;
        return;
      }
    }

    if (!ref) {
      blank += 1;
      return;
    }
    // Case-insensitive, because the same file often mixes them.
    const key = ref.toUpperCase();
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.add(key);
    lines.push({ ref, amount: cellNumber(amountCell) });
  });

  return { lines, blank, duplicates, headerSkipped };
}
