// §4.25 — the client-mode filter and sort behind <DataTable>.
//
// Pure and extracted from the component so the ordering rules can be tested
// directly. Every list screen in the app now depends on these two functions, so
// a change here is a change to how sixty-six tables behave.

export interface SortableColumn<T> {
  key: string;
  /** Comparable/searchable value when the cell is computed rather than a field. */
  value?: (row: T) => string | number | null | undefined;
}

function cellValue<T>(row: T, col: SortableColumn<T>): string | number | null | undefined {
  return col.value ? col.value(row) : (row as Record<string, unknown>)[col.key] as string | number | null | undefined;
}

/** The cell as searchable text. Null and undefined are empty, never "null". */
export function cellText<T>(row: T, col: SortableColumn<T>): string {
  const raw = cellValue(row, col);
  return raw === null || raw === undefined ? '' : String(raw);
}

/** True when any column contains the query, case-insensitively. */
export function matchesSearch<T>(row: T, columns: SortableColumn<T>[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return columns.some((c) => cellText(row, c).toLowerCase().includes(q));
}

/**
 * Compare two rows on the sorted column.
 *
 * Text compares with `localeCompare` in numeric mode, so 'apple' sorts before
 * 'Zinc' (a raw `<` puts every capital first) and 'Item 2' before 'Item 10'.
 * Blanks always sink to the bottom, in both directions — an empty cell means "no
 * value", not "the smallest value", and flipping the arrow should not fill the
 * top of the table with empty rows.
 */
export function compareRows<T>(
  a: T,
  b: T,
  columns: SortableColumn<T>[],
  sort: { key: string; dir: 'asc' | 'desc' },
): number {
  const col = columns.find((c) => c.key === sort.key);
  if (!col) return 0;

  const av = cellValue(a, col);
  const bv = cellValue(b, col);
  if (av === bv) return 0;

  const aBlank = av === null || av === undefined || av === '';
  const bBlank = bv === null || bv === undefined || bv === '';
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;

  const dir = sort.dir === 'asc' ? 1 : -1;
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
  return (
    String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir
  );
}
