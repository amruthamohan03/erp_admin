import { describe, it, expect } from 'vitest';
import {
  activeFilterCount,
  applyLayout,
  EMPTY_LAYOUT,
  matchesColumnFilters,
  moveColumn,
  orderedForChooser,
  toggleHidden,
} from './dataTableColumns';

interface Row {
  client: string;
  bank: string;
  expiry: string;
  amount: number;
}

const COLUMNS = [
  { key: 'client' },
  { key: 'bank' },
  { key: 'expiry' },
  { key: 'amount' },
];

const keys = (cols: Array<{ key: string }>) => cols.map((c) => c.key);

describe('applyLayout', () => {
  it('leaves the declared order alone when there is no saved view', () => {
    expect(keys(applyLayout(COLUMNS, EMPTY_LAYOUT))).toEqual(['client', 'bank', 'expiry', 'amount']);
  });

  it('reorders to the saved order', () => {
    expect(keys(applyLayout(COLUMNS, { order: ['amount', 'client'], hidden: [] })))
      .toEqual(['amount', 'client', 'bank', 'expiry']);
  });

  it('hides what the operator hid', () => {
    expect(keys(applyLayout(COLUMNS, { order: [], hidden: ['bank', 'amount'] })))
      .toEqual(['client', 'expiry']);
  });

  it('APPENDS a column the saved view has never seen', () => {
    // The rule that matters most: ship a new column and an operator with a saved
    // view must still see it, or it is invisible with nothing explaining why.
    const withNew = [...COLUMNS, { key: 'status' }];
    expect(keys(applyLayout(withNew, { order: ['amount', 'client', 'bank', 'expiry'], hidden: [] })))
      .toEqual(['amount', 'client', 'bank', 'expiry', 'status']);
  });

  it('ignores a key the table no longer declares', () => {
    // A removed column must not leave a hole or throw in somebody's saved view.
    expect(keys(applyLayout(COLUMNS, { order: ['deleted_col', 'amount'], hidden: ['also_gone'] })))
      .toEqual(['amount', 'client', 'bank', 'expiry']);
  });

  it('survives a duplicated key in a saved order', () => {
    expect(keys(applyLayout(COLUMNS, { order: ['bank', 'bank'], hidden: [] })))
      .toEqual(['bank', 'client', 'expiry', 'amount']);
  });

  it('can hide everything without crashing', () => {
    expect(applyLayout(COLUMNS, { order: [], hidden: keys(COLUMNS) })).toEqual([]);
  });
});

describe('orderedForChooser', () => {
  it('keeps hidden columns in place so unhiding is predictable', () => {
    // The chooser must list a hidden column where it will reappear, not at the end.
    expect(keys(orderedForChooser(COLUMNS, { order: [], hidden: ['bank'] })))
      .toEqual(['client', 'bank', 'expiry', 'amount']);
  });
});

describe('moveColumn', () => {
  it('moves a column up and down', () => {
    const down = moveColumn(COLUMNS, EMPTY_LAYOUT, 'client', 1);
    expect(down.order).toEqual(['bank', 'client', 'expiry', 'amount']);
    const back = moveColumn(COLUMNS, down, 'client', -1);
    expect(back.order).toEqual(['client', 'bank', 'expiry', 'amount']);
  });

  it('refuses to move past either end', () => {
    expect(moveColumn(COLUMNS, EMPTY_LAYOUT, 'client', -1)).toBe(EMPTY_LAYOUT);
    expect(moveColumn(COLUMNS, EMPTY_LAYOUT, 'amount', 1)).toBe(EMPTY_LAYOUT);
  });

  it('writes the FULL order, not just the moved pair', () => {
    // A partial order would let untouched columns drift the next time the
    // declared list changes.
    expect(moveColumn(COLUMNS, EMPTY_LAYOUT, 'expiry', -1).order).toHaveLength(4);
  });

  it('moves a column past a hidden one', () => {
    // The chooser reorders the full list, so hiding a column does not create a
    // gap the operator has to step over twice.
    const layout = { order: [], hidden: ['bank'] };
    expect(moveColumn(COLUMNS, layout, 'client', 1).order)
      .toEqual(['bank', 'client', 'expiry', 'amount']);
  });
});

describe('toggleHidden', () => {
  it('hides and unhides without duplicating', () => {
    let l = toggleHidden(EMPTY_LAYOUT, 'bank', true);
    l = toggleHidden(l, 'bank', true);
    expect(l.hidden).toEqual(['bank']);
    expect(toggleHidden(l, 'bank', false).hidden).toEqual([]);
  });
});

describe('matchesColumnFilters', () => {
  const row: Row = { client: 'TCL', bank: 'ACCESS BANK', expiry: '2026-09-30', amount: 2910 };

  it('passes a row when nothing is filtered', () => {
    expect(matchesColumnFilters(row, COLUMNS, {})).toBe(true);
    expect(matchesColumnFilters(row, COLUMNS, { bank: '   ' })).toBe(true);
  });

  it('matches a substring, case-insensitively', () => {
    expect(matchesColumnFilters(row, COLUMNS, { bank: 'access' })).toBe(true);
    expect(matchesColumnFilters(row, COLUMNS, { bank: 'raw' })).toBe(false);
  });

  it('ANDs across columns — each box narrows the last', () => {
    expect(matchesColumnFilters(row, COLUMNS, { client: 'TCL', bank: 'ACCESS' })).toBe(true);
    expect(matchesColumnFilters(row, COLUMNS, { client: 'TCL', bank: 'RAW' })).toBe(false);
  });

  it('matches a date the way the column DISPLAYS it', () => {
    // §4.19 — the column shows 30-09-2026; typing that must find the row, and
    // the stored ISO must keep working too.
    expect(matchesColumnFilters(row, COLUMNS, { expiry: '30-09-2026' })).toBe(true);
    expect(matchesColumnFilters(row, COLUMNS, { expiry: '2026-09' })).toBe(true);
  });

  it('matches a numeric column as text', () => {
    expect(matchesColumnFilters(row, COLUMNS, { amount: '291' })).toBe(true);
  });

  it('ignores a filter for a column that is not declared', () => {
    expect(matchesColumnFilters(row, COLUMNS, { nonexistent: 'zzz' })).toBe(true);
  });
});

describe('activeFilterCount', () => {
  it('counts only boxes with something in them', () => {
    expect(activeFilterCount({ a: 'x', b: '', c: '  ', d: 'y' })).toBe(2);
  });
});
