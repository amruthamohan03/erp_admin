import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, getTableColumns, ilike, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp, type XlsxColumn } from '@/lib/xlsx';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { MASTER_EXPORTS, EXPORT_EXCLUDED_COLUMNS } from '@/lib/masters/exportRegistry';

// GET /api/v1/masters/{source}/export?q=
//
// The Excel export behind every master screen's toolbar button (§4.25), for all
// 40 masters that have no bespoke one. `source` is the slug the screen already
// lists from, resolved against the closed registry — an unknown slug is a 404,
// so this is not a way to read an arbitrary table over HTTP.
//
// It mirrors what the screen shows, deliberately and in three ways:
//
//   * the SAME `q`, matched the same way the list routes match it (ilike across
//     the text columns), because an export of a filtered list must contain the
//     rows that list was showing (§4.15);
//   * active rows only, because that is what a master lists (§4.27);
//   * every column of the row except the excluded set, so nothing an operator
//     can see on screen is missing from the sheet.

/** A sheet is a bounded artifact; a master that large wants a report, not this. */
const MAX_ROWS = 5000;

/**
 * Words that are acronyms rather than words, so they stay upper case.
 *
 * Needed because the obvious rule — "short words are acronyms" — is wrong in
 * both directions: it turned `created_at` into "Created AT" and `is_customs`
 * into "IS Customs", while leaving the customs duty codes as "Ddi"/"Ica". A
 * list is duller than a rule and it is right.
 */
const ACRONYMS = new Set([
  'id', 'url', 'ddi', 'ica', 'dci', 'dcl', 'tpi', 'tva', 'vat', 'dgi', 'hs',
  'cif', 'fob', 'swift', 'bcc', 'mca', 'lt', 'drc',
]);

/** `goods_short_name` → `Goods Short Name`; `hscode_ddi` → `Hscode DDI`. */
function humanize(column: string): string {
  return column
    .split('_')
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Width that roughly fits the header plus a typical value, capped. */
function widthFor(header: string): number {
  return Math.min(Math.max(header.length + 4, 12), 40);
}

/**
 * One cell, rendered for a human reader.
 *
 * Dates go through the shared formatter — §4.19 is explicit that a spreadsheet
 * cell is display, and the most easily missed place to break the rule, because
 * nobody looks at it in the browser. A sheet leaves the office and is read by
 * someone with no way to ask what `03/04/2026` meant.
 */
function cell(value: unknown, columnName: string): string | number {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return columnName.endsWith('_at') ? formatDateTime(value, '') : formatDate(value, '');
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value;
  const text = String(value);
  // The soft-delete flag reads as a word. 'Y' means nothing to someone holding
  // a printout (§4.23's "say what it is" applied to a cell).
  if (columnName === 'display') return text === 'Y' ? 'Active' : 'Inactive';
  // A stored date arrives as a string from a `date` column.
  if (/^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(text)) {
    return columnName.endsWith('_at') ? formatDateTime(text, '') : formatDate(text, '');
  }
  return text;
}

type Ctx = { params: Promise<{ source: string }> };

export const GET = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { source } = await params;
  const entry = MASTER_EXPORTS[source];
  if (!entry) throw new NotFoundError(`There is no exportable master called “${source}”.`);

  const columns = getTableColumns(entry.table);
  const exported = Object.entries(columns).filter(
    ([, col]) => !EXPORT_EXCLUDED_COLUMNS.has(col.name),
  );

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();

  const conds: SQL[] = [];
  // Not every master carries the flag; the ones that do list active rows only.
  if ('display' in columns) conds.push(eq(columns.display, 'Y'));

  if (q) {
    const like = `%${q}%`;
    // Text columns only — ilike against an integer or a date is a type error,
    // and searching an id by substring is meaningless anyway.
    const searchable = exported
      .filter(([, col]) => col.dataType === 'string' && col.name !== 'display')
      .map(([, col]) => ilike(col, like));
    if (searchable.length > 0) {
      const anyMatch = or(...searchable);
      if (anyMatch) conds.push(anyMatch);
    }
  }

  const selection = Object.fromEntries(exported) as Record<string, (typeof exported)[number][1]>;
  const rows = await db
    .select(selection)
    .from(entry.table)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(asc(columns.id ?? exported[0][1]))
    .limit(MAX_ROWS);

  const sheetColumns: XlsxColumn[] = exported.map(([key, col]) => ({
    key,
    header: humanize(col.name),
    width: widthFor(humanize(col.name)),
  }));

  const sheetRows = rows.map((row) =>
    Object.fromEntries(
      exported.map(([key, col]) => [key, cell((row as Record<string, unknown>)[key], col.name)]),
    ),
  );

  // §4.28 — an export is a logged action, and the filter it ran under is part of
  // what was exported.
  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: source,
    entityId: 'list',
    module: 'masters',
    after: { rows: sheetRows.length, filter: q || null },
  });

  const buf = await buildXlsx([{ name: entry.label, columns: sheetColumns, rows: sheetRows }]);
  const file = `${source}-${dateStamp()}.xlsx`;
  const res = xlsxResponse(buf, file);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
