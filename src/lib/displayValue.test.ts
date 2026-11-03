import { describe, expect, it } from 'vitest';
import { displayText, emptyFor, hiddenWhileEmpty, isBlank, NO_VALUE } from './displayValue';
import { cellText, compareRows, matchesSearch } from './dataTableSort';

describe('displayValue (§4.41)', () => {
  it('reads N/A for nothing, and the value otherwise', () => {
    expect(NO_VALUE).toBe('N/A');
    expect(displayText(null)).toBe('N/A');
    expect(displayText(undefined)).toBe('N/A');
    expect(displayText('')).toBe('N/A');
    expect(displayText('   ')).toBe('N/A');
    expect(displayText('NMI')).toBe('NMI');
    expect(displayText(0)).toBe('0');
  });

  it('treats only null, undefined and whitespace as blank', () => {
    expect(isBlank(0)).toBe(false);
    expect(isBlank(false)).toBe(false);
    expect(isBlank(' x ')).toBe(false);
  });

  it('uses N/A for words and the em dash for dates and numbers', () => {
    expect(emptyFor('text')).toBe('N/A');
    expect(emptyFor('select')).toBe('N/A');
    expect(emptyFor('file')).toBe('N/A');
    expect(emptyFor('date')).toBe('—');
    expect(emptyFor('number')).toBe('—');
    expect(emptyFor(undefined)).toBe('—');
  });
});

describe('hiddenWhileEmpty', () => {
  it('hides only a field configured for it, and only while it is empty', () => {
    expect(hiddenWhileEmpty({ hideWhenEmpty: true }, null)).toBe(true);
    expect(hiddenWhileEmpty({ hideWhenEmpty: true }, '')).toBe(true);
    expect(hiddenWhileEmpty({ hideWhenEmpty: true }, '42')).toBe(false);
    expect(hiddenWhileEmpty({ colSpan: '5-per-row' }, null)).toBe(false);
    expect(hiddenWhileEmpty(null, null)).toBe(false);
  });
});

describe('a blank DataTable cell', () => {
  const col = { key: 'supplier' };
  const rows = [{ supplier: 'ACME' }, { supplier: null }, { supplier: '' }];

  it('reads N/A, so typing what it shows finds it', () => {
    expect(cellText(rows[1], col)).toBe('N/A');
    expect(cellText(rows[2], col)).toBe('N/A');
    expect(rows.filter((r) => matchesSearch(r, [col], 'n/a'))).toHaveLength(2);
  });

  it('still sorts to the bottom, not as the letters N/A', () => {
    const sorted = [...rows].sort((a, b) => compareRows(a, b, [col], { key: 'supplier', dir: 'asc' }));
    expect(sorted[0]).toEqual({ supplier: 'ACME' });
  });
});
