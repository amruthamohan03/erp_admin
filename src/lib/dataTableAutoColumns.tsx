import type { ReactNode } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import { displayLabel } from '@/lib/statusTone';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { humanizeFieldPath } from '@/lib/validation/messages';
import type { DataTableColumn } from '@/components/ui/DataTable';

// §4.25.1 — every field a list row CARRIES is offered in the column chooser,
// not just the handful the screen was built around.
//
// A list endpoint returns more than its table shows: the clients list fetches
// `address`, `created_at` and `updated_at` on every row and renders none of
// them, imports joins `regime_name` and drops it, users carries nine fields the
// grid never displays. Which of those matter is per operator and per day — one
// person reconciles by regime, another never looks at it — so the screen is the
// wrong place to decide, exactly as the ORDER of the columns is (§4.25.1).
//
// Derived here rather than declared on ~70 pages so every table gains it from
// one change, which is the whole return on <DataTable> existing (§4.10). The
// cost is that these columns get an inferred header and an inferred rendering
// instead of an authored one; a field worth first-class treatment should be
// promoted to a declared column, and declaring it removes it from here
// automatically.

/**
 * Keys never offered as a column.
 *
 * Primary and foreign keys are excluded for the reason §4.9 keeps the raw `id`
 * out of the `#` column: they leak the key space and mean nothing to an
 * operator, who reads the `_name` the join already provides. Credentials are
 * excluded because a column is a place a value gets read, copied and exported.
 */
const EXCLUDED_KEY = /^(?:id|.*_id)$|password|token|secret|hash/i;

/** A stored date, and a stored date that carries a clock (§4.19). */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

const field = (row: unknown, key: string): unknown => (row as Record<string, unknown>)[key];

/**
 * A value this module is willing to put in a cell.
 *
 * An object or an array has no honest one-line rendering — `[object Object]` is
 * worse than the column not being offered — and a repeating group (§4.5) is
 * read inside the record, not across a grid.
 */
function isRenderable(value: unknown): boolean {
  return value === null || value === undefined || typeof value !== 'object';
}

/**
 * The cell, formatted by what the value IS rather than what the key is called.
 *
 * Detection is per value, not per column: one row carrying a date and the next
 * carrying nothing must not change how the first is drawn. Dates go through the
 * shared formatter, so an auto column obeys §4.19 like any authored one — this
 * is the single most likely way a derived column would have broken a rule.
 */
function autoCell(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const text = String(value);
  if (ISO_DATETIME.test(text)) return formatDateTime(text);
  if (ISO_DATE.test(text)) return formatDate(text);
  return text;
}

/**
 * Every field on the rows that no column already declares, as hidden columns.
 *
 * `sortable` is the caller's to decide: in server mode the endpoint does the
 * ordering, and offering a sort it has never heard of is a control that lies
 * (§4.25.1).
 */
export function deriveAutoColumns<T>(
  rows: readonly T[],
  declared: readonly { key: string }[],
  { sortable }: { sortable: boolean },
): DataTableColumn<T>[] {
  if (rows.length === 0) return [];

  const taken = new Set(declared.map((c) => c.key));
  // First non-null wins: the sample decides how the column SORTS, and a column
  // whose every value is null on this page is still a field the operator asked
  // to see, so it is offered rather than guessed away.
  const samples = new Map<string, unknown>();

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      if (taken.has(key) || EXCLUDED_KEY.test(key)) continue;
      // Registered on sight, then upgraded by any later row that actually has a
      // value — a field that is null on row 1 and a date on row 2 is a date.
      const current = samples.get(key);
      if (current === null || current === undefined) samples.set(key, field(row, key));
    }
  }

  const columns: DataTableColumn<T>[] = [];
  for (const [key, sample] of samples) {
    if (!isRenderable(sample)) continue;

    // §4.38 — the soft-delete flag is a status, so it reads Active / Disabled in
    // a badge, and sorts and filters on those words rather than on 'Y' / 'N'.
    const isDisplayFlag = key === 'display';
    const isBoolean = typeof sample === 'boolean';

    columns.push({
      key,
      header: humanizeFieldPath([key]),
      sortable,
      defaultHidden: true,
      render: isDisplayFlag
        ? (row) => <StatusBadge status={displayLabel(field(row, key))} />
        : (row) => autoCell(field(row, key)),
      // Whatever the cell DISPLAYS has to be typeable into the box above it
      // (§4.25.1). A date needs no accessor — `cellText` already contributes the
      // `DD-MM-YYYY` form alongside the ISO the row carries.
      value: isDisplayFlag
        ? (row) => displayLabel(field(row, key))
        : isBoolean
          ? (row) => (field(row, key) ? 'Yes' : 'No')
          : undefined,
    });
  }

  return columns;
}

export default deriveAutoColumns;
