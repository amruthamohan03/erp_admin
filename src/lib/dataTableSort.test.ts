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

describe('matchesSearch on dates (§4.19)', () => {
  interface DateRow { holiday_date: string; created_at: string; ref: string }
  const DATE_COLUMNS: SortableColumn<DateRow>[] = [
    { key: 'holiday_date' },
    { key: 'created_at' },
    { key: 'ref' },
  ];
  const row: DateRow = {
    holiday_date: '2026-06-30',
    created_at: '2026-01-17T09:30:00Z',
    ref: '2026-0001',
  };

  it('matches the DD-MM-YYYY form the column actually displays', () => {
    expect(matchesSearch(row, DATE_COLUMNS, '30-06-2026')).toBe(true);
    expect(matchesSearch(row, DATE_COLUMNS, '17-01-2026')).toBe(true);
  });

  it('still matches the stored ISO', () => {
    expect(matchesSearch(row, DATE_COLUMNS, '2026-06-30')).toBe(true);
  });

  it('matches a partial day-month, the way an operator narrows a list', () => {
    expect(matchesSearch(row, DATE_COLUMNS, '30-06')).toBe(true);
  });

  it('does not invent a date out of a reference that merely starts with a year', () => {
    // '2026-0001' is a reference, not a date — it must not gain a reversed twin.
    expect(matchesSearch(row, DATE_COLUMNS, '0001-2026')).toBe(false);
    expect(matchesSearch(row, DATE_COLUMNS, '2026-0001')).toBe(true);
  });

  it('leaves non-dates alone', () => {
    expect(matchesSearch(rows[1], COLUMNS, 'apple')).toBe(true);
    expect(matchesSearch(rows[1], COLUMNS, '2026')).toBe(false);
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
