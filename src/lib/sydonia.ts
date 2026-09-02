// §3 Sydonia bulk-update — the pure half: what a spreadsheet row means, and
// whether its data can be written.
//
// Kept out of src/db/queries/sydonia.ts (which owns the SQL) so the rules an
// operator actually meets — which dates parse, why a reference is rejected, what
// will really be written — are testable without a database, the same split as
// actionStyles (§4.10). The route and the screen both read their vocabulary here.

export type SydoniaKind = 'import' | 'export';

/** Excel columns A–H. Column C ("Declaration Date") writes dgda_in_date, per the legacy mapping. */
export const SYDONIA_COLUMNS = [
  { key: 'mca_ref', letter: 'A', label: 'MCA Ref', type: 'ref', column: 'mca_ref' },
  { key: 'declaration_reference', letter: 'B', label: 'Declaration Ref', type: 'text', column: 'declaration_reference' },
  { key: 'declaration_date', letter: 'C', label: 'Declaration Date', type: 'date', column: 'dgda_in_date' },
  { key: 'liquidation_reference', letter: 'D', label: 'Liquidation Ref', type: 'text', column: 'liquidation_reference' },
  { key: 'liquidation_date', letter: 'E', label: 'Liquidation Date', type: 'date', column: 'liquidation_date' },
  { key: 'quittance_reference', letter: 'F', label: 'Quittance Ref', type: 'text', column: 'quittance_reference' },
  { key: 'quittance_date', letter: 'G', label: 'Quittance Date', type: 'date', column: 'quittance_date' },
  { key: 'liquidation_amount', letter: 'H', label: 'Liquidation Amount', type: 'number', column: 'liquidation_amount' },
] as const;

/** The seven writable columns — column A identifies the record, it is not written. */
export const SYDONIA_DATA_COLUMNS = SYDONIA_COLUMNS.filter((c) => c.type !== 'ref');

export type SydoniaDataKey = (typeof SYDONIA_DATA_COLUMNS)[number]['key'];

export interface SydoniaRow {
  mca_ref: string;
  declaration_reference: string;
  declaration_date: string;
  liquidation_reference: string;
  liquidation_date: string;
  quittance_reference: string;
  quittance_date: string;
  liquidation_amount: string;
}

export const normalizeRef = (s: string): string => (s ?? '').trim().toUpperCase();

/**
 * `YYYY-MM-DD`, or null when the cell is not a date.
 *
 * Day-first, because that is how every date in this app is written and read
 * (§4.19): `03-04-2026` is 3 April, never 4 March.
 *
 * Returns null for an impossible date rather than letting `Date` roll it
 * forward — `31/02/2026` silently becoming 3 March is a customs date wrong by
 * days, and the operator has no way to notice. Reported, it gets fixed.
 */
export function cleanDate(v: string): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;

  // Day-first: 03/04/2026, 3-4-26, 03.04.2026
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return isoIfReal(year, Number(dmy[2]), Number(dmy[1]));
  }

  // ISO, read TEXTUALLY. `new Date('2025-08-29')` is UTC midnight, which renders
  // as the 28th for anyone west of Greenwich — the timezone trap §4.19 exists to
  // avoid, and it would silently shift every date in an uploaded file by a day.
  // Anchored, so a reference like "DEC-2026-0001" is never read as a date.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return isoIfReal(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  return null;
}

/** `YYYY-MM-DD` for a date that exists, else null. */
function isoIfReal(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || y < 1900 || y > 2999) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Local components only — no string parsing, so no timezone is involved. A
  // rollover (31 Feb → 3 Mar) means the cell was not a real date.
  const probe = new Date(y, m - 1, d);
  if (probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}

export type RowStatus = 'ready' | 'missing' | 'deleted' | 'empty' | 'duplicate';

export interface ParsedCells {
  /** Only the cells that will actually be written, already coerced. */
  parsed: Partial<Record<SydoniaDataKey, string>>;
  /** Cells that hold something unusable and will be skipped. */
  warnings: string[];
}

/**
 * Coerce columns B–H once, up front.
 *
 * Doing this at validation time rather than at commit time is what lets the
 * preview show the value that will REALLY be written. A date the sheet spells
 * oddly used to be dropped silently on save, so a row reported as updated had
 * quietly not taken one of its columns.
 */
export function parseDataCells(row: SydoniaRow): ParsedCells {
  const parsed: Partial<Record<SydoniaDataKey, string>> = {};
  const warnings: string[] = [];

  for (const col of SYDONIA_DATA_COLUMNS) {
    const raw = (row[col.key] ?? '').trim();
    if (!raw) continue;

    if (col.type === 'date') {
      const iso = cleanDate(raw);
      if (iso) parsed[col.key] = iso;
      else warnings.push(`${col.label} (column ${col.letter}) reads "${raw}", which is not a date — that column will be left unchanged.`);
    } else if (col.type === 'number') {
      const n = Number(raw.replace(/\s/g, ''));
      if (raw !== '' && Number.isFinite(n)) parsed[col.key] = String(n);
      else warnings.push(`${col.label} (column ${col.letter}) reads "${raw}", which is not a number — that column will be left unchanged.`);
    } else {
      parsed[col.key] = raw;
    }
  }

  return { parsed, warnings };
}

export interface RefMatch {
  id: number;
  display: 'Y' | 'N';
}

export interface RowVerdict extends ParsedCells {
  status: RowStatus;
  /** Empty for `ready`. Names the reference and the fix (§4.23). */
  reason: string;
  record_id: number | null;
}

/**
 * Decide whether one row's data can be added, and say why not.
 *
 * Four rejections, not one, because they need four different actions from the
 * operator: correct the spelling, restore from the Recycle Bin, fill in the
 * columns, or merge the duplicate rows. "Invalid" would send them looking in the
 * wrong place for all but one of those.
 */
export function classifyRow(
  row: SydoniaRow,
  match: RefMatch | undefined,
  opts: { kind: SydoniaKind; alreadySeen: boolean },
): RowVerdict {
  const cells = parseDataCells(row);
  const ref = row.mca_ref.trim();
  const kindLabel = opts.kind === 'import' ? 'import' : 'export';

  if (opts.alreadySeen) {
    return {
      ...cells,
      status: 'duplicate',
      reason: `${ref} appears more than once in this file. Only the first row for a reference is applied — merge the rows and upload again.`,
      record_id: match?.id ?? null,
    };
  }
  if (!match) {
    return {
      ...cells,
      status: 'missing',
      reason: `${ref} does not exist in the ${kindLabel} records, so there is nothing to add the data to.`,
      record_id: null,
    };
  }
  if (match.display === 'N') {
    return {
      ...cells,
      status: 'deleted',
      reason: `${ref} has been deleted. Restore it from the Recycle Bin, then upload this file again.`,
      record_id: match.id,
    };
  }
  if (Object.keys(cells.parsed).length === 0) {
    return {
      ...cells,
      status: 'empty',
      reason: `${ref} was found, but columns B to H hold nothing that can be written.`,
      record_id: match.id,
    };
  }

  return { ...cells, status: 'ready', reason: '', record_id: match.id };
}
