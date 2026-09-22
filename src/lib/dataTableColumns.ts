import { cellText, type SortableColumn } from '@/lib/dataTableSort';

// §4.25 — which columns a table shows, in what order, and the per-column filters.
//
// Both are per-OPERATOR view preferences, not configuration: one person works the
// licence list by bank and another by expiry, and neither choice belongs to the
// screen. So this lives beside the table rather than in a master table, and the
// declared columns stay the single source of what a column IS — a layout only
// reorders and hides.

/** The minimum a column has to declare for a layout to place it. */
export interface LayoutColumn {
  key: string;
  /**
   * Off until the operator asks for it. Set on the columns derived from the row
   * data (§4.25.1) — every field the endpoint returns is OFFERED, but turning
   * twelve of them on by default would bury the eight the screen was built
   * around.
   */
  defaultHidden?: boolean;
}

/** A saved view: the order columns appear in, and which are hidden or shown. */
export interface ColumnLayout {
  /** Column keys in display order. Keys the table no longer declares are ignored. */
  order: string[];
  /** Column keys the operator has hidden. */
  hidden: string[];
  /**
   * Column keys the operator has explicitly turned ON.
   *
   * Needed only because `defaultHidden` exists: without it, "not in `hidden`"
   * means both "never touched" and "deliberately shown", which are the same
   * thing for a normal column and opposite things for a default-hidden one.
   *
   * Optional because this structure is persisted and unversioned: a layout
   * saved before the field existed genuinely has none, and that reads correctly
   * as "this operator has never turned a derived column on".
   */
  shown?: string[];
}

export const EMPTY_LAYOUT: ColumnLayout = { order: [], hidden: [], shown: [] };

/** Whether a column renders, given the operator's saved choices. */
export function isColumnVisible(col: LayoutColumn, layout: ColumnLayout): boolean {
  if (layout.hidden.includes(col.key)) return false;
  if (col.defaultHidden) return layout.shown?.includes(col.key) ?? false;
  return true;
}

/**
 * The columns in display order — every one of them, hidden or not.
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
function orderColumns<C extends LayoutColumn>(columns: readonly C[], order: readonly string[]): C[] {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const seen = new Set<string>();
  const ordered: C[] = [];

  for (const key of order) {
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
  return ordered;
}

/** The declared columns, reordered and filtered by a saved layout. */
export function applyLayout<C extends LayoutColumn>(
  columns: readonly C[],
  layout: ColumnLayout,
): C[] {
  return orderColumns(columns, layout.order).filter((c) => isColumnVisible(c, layout));
}

/**
 * The same ordering, but keeping hidden columns — what the column chooser lists.
 *
 * The chooser has to show a hidden column in its place, or unhiding it would
 * make it reappear somewhere unexpected.
 */
export function orderedForChooser<C extends LayoutColumn>(
  columns: readonly C[],
  layout: ColumnLayout,
): C[] {
  return orderColumns(columns, layout.order);
}

/** Move one column one position, returning a layout that pins the whole order. */
export function moveColumn<C extends LayoutColumn>(
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

/**
 * Record that the operator showed or hid one column.
 *
 * Both lists are maintained, so the choice survives whatever the column's
 * default is: a default-hidden field the operator turned on stays on, and a
 * normal column they turned off stays off.
 */
export function toggleHidden(layout: ColumnLayout, key: string, hidden: boolean): ColumnLayout {
  const hiddenSet = new Set(layout.hidden);
  const shownSet = new Set(layout.shown ?? []);
  if (hidden) {
    hiddenSet.add(key);
    shownSet.delete(key);
  } else {
    hiddenSet.delete(key);
    shownSet.add(key);
  }
  return { ...layout, hidden: [...hiddenSet], shown: [...shownSet] };
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
