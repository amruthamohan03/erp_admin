import { cellText, type SortableColumn } from '@/lib/dataTableSort';

// §4.25 — which columns a table shows, in what order, and the per-column filters.
//
// Both are per-OPERATOR view preferences, not configuration: one person works the
// licence list by bank and another by expiry, and neither choice belongs to the
// screen. So this lives beside the table rather than in a master table, and the
// declared columns stay the single source of what a column IS — a layout only
// reorders and hides.

/** A saved view: the order columns appear in, and which are hidden. */
export interface ColumnLayout {
  /** Column keys in display order. Keys the table no longer declares are ignored. */
  order: string[];
  /** Column keys the operator has hidden. */
  hidden: string[];
}

export const EMPTY_LAYOUT: ColumnLayout = { order: [], hidden: [] };

/**
 * The declared columns, reordered and filtered by a saved layout.
 *
 * Two robustness rules matter more than the ordering itself, because a saved
 * layout outlives the code that produced it:
 *
 *   * A column the layout has never seen is APPENDED, not dropped. Ship a new
 *     column and every operator with a saved view would otherwise never see it,
 *     with nothing on screen to explain why.
 *   * A key the table no longer declares is ignored rather than rendered. A
 *     removed column must not leave a hole or a crash in somebody's saved view.
 */
export function applyLayout<C extends { key: string }>(
  columns: readonly C[],
  layout: ColumnLayout,
): C[] {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const seen = new Set<string>();
  const ordered: C[] = [];

  for (const key of layout.order) {
    const col = byKey.get(key);
    if (col && !seen.has(key)) {
      ordered.push(col);
      seen.add(key);
    }
  }
  // Anything the layout did not mention keeps its declared position, after the
  // columns that were explicitly ordered.
  for (const col of columns) {
    if (!seen.has(col.key)) ordered.push(col);
  }

  const hidden = new Set(layout.hidden);
  return ordered.filter((c) => !hidden.has(c.key));
}

/**
 * The same ordering, but keeping hidden columns — what the column chooser lists.
 *
 * The chooser has to show a hidden column in its place, or unhiding it would
 * make it reappear somewhere unexpected.
 */
export function orderedForChooser<C extends { key: string }>(
  columns: readonly C[],
  layout: ColumnLayout,
): C[] {
  return applyLayout(columns, { order: layout.order, hidden: [] });
}

/** Move one column one position, returning a layout that pins the whole order. */
export function moveColumn<C extends { key: string }>(
  columns: readonly C[],
  layout: ColumnLayout,
  key: string,
  direction: -1 | 1,
): ColumnLayout {
  const keys = orderedForChooser(columns, layout).map((c) => c.key);
  const from = keys.indexOf(key);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= keys.length) return layout;
  const next = [...keys];
  [next[from], next[to]] = [next[to], next[from]];
  // The full order is written out, not just the pair: a partial order would let
  // the untouched columns drift the next time the declared list changes.
  return { ...layout, order: next };
}

export function toggleHidden(layout: ColumnLayout, key: string, hidden: boolean): ColumnLayout {
  const set = new Set(layout.hidden);
  if (hidden) set.add(key);
  else set.delete(key);
  return { ...layout, hidden: [...set] };
}

/**
 * Per-column filter text, keyed by column key. An empty or whitespace-only
 * value is not a filter — it is a box the operator cleared.
 */
export type ColumnFilters = Record<string, string>;

export function activeFilterCount(filters: ColumnFilters): number {
  return Object.values(filters).filter((v) => v.trim() !== '').length;
}

/**
 * Whether a row satisfies every active column filter.
 *
 * Matched against `cellText`, which is what the SORT and the global search
 * already use — so a filter matches what the column DISPLAYS, including the
 * `DD-MM-YYYY` form of a date (§4.19). Typing what is on screen has to find the
 * row; that pairing is the whole point of `cellText` contributing both forms.
 *
 * Substring, case-insensitive, and ANDed across columns: each box narrows what
 * the previous ones left, which is how a filter row is read.
 */
export function matchesColumnFilters<T>(
  row: T,
  columns: readonly SortableColumn<T>[],
  filters: ColumnFilters,
): boolean {
  for (const col of columns) {
    const needle = filters[col.key]?.trim().toLowerCase();
    if (!needle) continue;
    if (!cellText(row, col).toLowerCase().includes(needle)) return false;
  }
  return true;
}
