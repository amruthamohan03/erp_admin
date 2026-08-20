import { describe, it, expect } from 'vitest';
import { compareRows, matchesSearch, type SortableColumn } from './dataTableSort';

// §4.25 — the client-mode filter and sort that every list screen now depends on.
// Extracted from the component so the ordering rules can be pinned without
// rendering a table.

interface Row {
  name: string | null;
  qty: number | null;
  code: string;
}

const COLUMNS: SortableColumn<Row>[] = [
  { key: 'name' },
  { key: 'qty' },
  { key: 'code' },
  // A computed cell: the searchable/comparable value comes from `value`.
  { key: 'label', value: (r) => `${r.code}-${r.name ?? ''}` },
];

const rows: Row[] = [
  { name: 'Zinc', qty: 2, code: 'B' },
  { name: 'apple', qty: 10, code: 'A' },
  { name: null, qty: null, code: 'C' },
  { name: 'Item 2', qty: 1, code: 'D' },
  { name: 'Item 10', qty: 3, code: 'E' },
];

describe('matchesSearch', () => {
  it('matches any column, case-insensitively', () => {
    expect(matchesSearch(rows[1], COLUMNS, 'APP')).toBe(true);
    expect(matchesSearch(rows[1], COLUMNS, 'nope')).toBe(false);
  });

  it('searches computed columns through `value`', () => {
    // 'a-apple' only exists via the computed label.
    expect(matchesSearch(rows[1], COLUMNS, 'a-apple')).toBe(true);
  });

  it('treats a null cell as empty rather than matching "null"', () => {
    expect(matchesSearch(rows[2], COLUMNS, 'null')).toBe(false);
  });

  it('matches everything on an empty query', () => {
    for (const r of rows) expect(matchesSearch(r, COLUMNS, '')).toBe(true);
  });
});

describe('compareRows', () => {
  const sortBy = (key: string, dir: 'asc' | 'desc') =>
    [...rows].sort((a, b) => compareRows(a, b, COLUMNS, { key, dir }));

  it('sorts text case-insensitively, not by character code', () => {
    // A naive comparison puts every capital before every lowercase, so 'Zinc'
    // would come before 'apple'.
    expect(sortBy('name', 'asc').map((r) => r.name)[0]).toBe('apple');
  });

  it('orders embedded numbers naturally', () => {
    const names = sortBy('name', 'asc').map((r) => r.name);
    expect(names.indexOf('Item 2')).toBeLessThan(names.indexOf('Item 10'));
  });

  it('sorts numbers numerically, not as strings', () => {
    expect(sortBy('qty', 'asc').map((r) => r.qty).filter((q) => q !== null)).toEqual([1, 2, 3, 10]);
  });

  it('keeps blanks last in BOTH directions', () => {
    // A blank is "no value", not "the smallest value" — flipping direction must
    // not float empty rows to the top.
    expect(sortBy('name', 'asc').at(-1)?.name).toBeNull();
    expect(sortBy('name', 'desc').at(-1)?.name).toBeNull();
  });

  it('reverses on desc', () => {
    const asc = sortBy('code', 'asc').map((r) => r.code);
    const desc = sortBy('code', 'desc').map((r) => r.code);
    expect(desc).toEqual([...asc].reverse());
  });

  it('leaves order untouched for an unknown column', () => {
    const out = [...rows].sort((a, b) => compareRows(a, b, COLUMNS, { key: 'missing', dir: 'asc' }));
    expect(out.map((r) => r.code)).toEqual(rows.map((r) => r.code));
  });
});
