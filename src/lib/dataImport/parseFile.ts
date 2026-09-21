// Reading an uploaded spreadsheet into headings + rows.
//
// ExcelJS is already a dependency (it writes every Excel export), so .xlsx needs
// nothing new; CSV / TSV are parsed here because the shapes that break a naive
// split — a quoted comma, a quoted newline, a doubled quote — are exactly the
// ones a customs spreadsheet contains (company names with commas).
import ExcelJS from 'exceljs';
import { ValidationError } from '@/lib/errors';

export interface SheetData {
  headings: string[];
  /** One object per row, keyed by heading. Blank rows are dropped. */
  rows: Record<string, string>[];
  /** The sheet the headings came from, when the workbook had several. */
  sheetName?: string;
}

/** Cap on what one upload may carry, so a stray file cannot exhaust memory. */
export const MAX_IMPORT_ROWS = 2000;

const SPREADSHEET_EXT = ['.xlsx', '.xlsm', '.csv', '.tsv', '.txt'];
const DOCUMENT_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif'];

export type UploadKind = 'spreadsheet' | 'document';

/** What kind of file this is, by extension — the browser's type is unreliable (§4.23). */
export function uploadKind(fileName: string): UploadKind {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  if (SPREADSHEET_EXT.includes(ext)) return 'spreadsheet';
  if (DOCUMENT_EXT.includes(ext)) return 'document';
  throw new ValidationError(
    `That file is a ${ext || 'file with no extension'}. Upload a spreadsheet (.xlsx, .csv) or a scan (.pdf, .png, .jpg).`,
    { field: 'file' },
  );
}

/** A cell as text: a date keeps its ISO day, a formula its computed result. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    return '';
  }
  return String(value).trim();
}

/** RFC-4180 enough: quoted fields, doubled quotes inside them, embedded newlines. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toSheet(matrix: string[][], sheetName?: string): SheetData {
  // The heading row is the first row that has any text in it — exports often
  // start with a title or a blank line above the real headings.
  const headerIndex = matrix.findIndex((r) => r.some((c) => c.trim() !== ''));
  if (headerIndex < 0) throw new ValidationError('That file has no rows in it.', { field: 'file' });

  const headings = (matrix[headerIndex] ?? []).map((h, i) => (h.trim() === '' ? `Column ${i + 1}` : h.trim()));
  const rows: Record<string, string>[] = [];
  for (const raw of matrix.slice(headerIndex + 1)) {
    if (!raw.some((c) => String(c).trim() !== '')) continue;
    const row: Record<string, string> = {};
    headings.forEach((h, i) => {
      row[h] = String(raw[i] ?? '').trim();
    });
    rows.push(row);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ValidationError(
        `That file has more than ${MAX_IMPORT_ROWS.toLocaleString('en-US')} rows — split it and import a part at a time.`,
        { field: 'file' },
      );
    }
  }
  if (rows.length === 0) throw new ValidationError('That file has headings but no rows under them.', { field: 'file' });
  return { headings, rows, sheetName };
}

export async function parseSpreadsheet(buffer: Buffer, fileName: string): Promise<SheetData> {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();

  if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
    const text = buffer.toString('utf8').replace(/^﻿/u, '');
    const delimiter = ext === '.tsv' || (text.split('\t').length > text.split(',').length) ? '\t' : ',';
    return toSheet(parseDelimited(text, delimiter));
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets.find((w) => w.rowCount > 0);
  if (!sheet) throw new ValidationError('That workbook has no sheet with any rows in it.', { field: 'file' });

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      values[col - 1] = cellText(cell.value);
    });
    matrix.push([...values].map((v) => v ?? ''));
  });
  return toSheet(matrix, sheet.name);
}
