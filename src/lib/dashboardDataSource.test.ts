import { describe, it, expect } from 'vitest';
import {
  parseDataSource,
  resolveJsonPath,
  heuristicValue,
  resolveCardValue,
  distinctEndpoints,
} from './dashboardDataSource';

describe('parseDataSource', () => {
  it('returns null for empty input', () => {
    expect(parseDataSource(null)).toBeNull();
    expect(parseDataSource(undefined)).toBeNull();
    expect(parseDataSource('')).toBeNull();
  });

  it('returns endpoint with empty path for bare URL', () => {
    expect(parseDataSource('/api/v1/foo')).toEqual({
      endpoint: '/api/v1/foo',
      path: '',
    });
  });

  it('splits on the first # only', () => {
    expect(parseDataSource('/api/v1/foo#stats.total')).toEqual({
      endpoint: '/api/v1/foo',
      path: 'stats.total',
    });
  });

  it('preserves additional # characters in the path', () => {
    expect(parseDataSource('/api/v1/foo#a#b')).toEqual({
      endpoint: '/api/v1/foo',
      path: 'a#b',
    });
  });

  it('treats a trailing # as empty path', () => {
    expect(parseDataSource('/api/v1/foo#')).toEqual({
      endpoint: '/api/v1/foo',
      path: '',
    });
  });
});

describe('resolveJsonPath', () => {
  it('returns the whole object for empty path', () => {
    expect(resolveJsonPath({ a: 1 }, '')).toEqual({ a: 1 });
  });

  it('walks a single key', () => {
    expect(resolveJsonPath({ a: 1 }, 'a')).toBe(1);
  });

  it('walks dot-separated keys', () => {
    expect(resolveJsonPath({ stats: { total: 42 } }, 'stats.total')).toBe(42);
  });

  it('returns undefined for missing keys', () => {
    expect(resolveJsonPath({ a: 1 }, 'b')).toBeUndefined();
  });

  it('returns undefined when path goes past a primitive', () => {
    expect(resolveJsonPath({ a: 1 }, 'a.b')).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    expect(resolveJsonPath(null, 'a')).toBeUndefined();
  });

  it('handles arrays via numeric keys', () => {
    expect(resolveJsonPath({ items: ['x', 'y'] }, 'items.0')).toBe('x');
  });
});

describe('heuristicValue', () => {
  it('returns numbers unchanged', () => {
    expect(heuristicValue(42)).toBe(42);
    expect(heuristicValue(0)).toBe(0);
  });

  it('prefers value > total > count', () => {
    expect(heuristicValue({ value: 1, total: 2, count: 3 })).toBe(1);
    expect(heuristicValue({ total: 2, count: 3 })).toBe(2);
    expect(heuristicValue({ count: 3 })).toBe(3);
  });

  it('returns array length', () => {
    expect(heuristicValue([1, 2, 3])).toBe(3);
    expect(heuristicValue([])).toBe(0);
  });

  it('returns null for unknown shapes', () => {
    expect(heuristicValue({ foo: 'bar' })).toBeNull();
    expect(heuristicValue('hello')).toBeNull();
    expect(heuristicValue(null)).toBeNull();
    expect(heuristicValue(undefined)).toBeNull();
  });
});

describe('resolveCardValue', () => {
  it('uses the path when provided', () => {
    expect(
      resolveCardValue({ stats: { total: 42 } }, 'stats.total'),
    ).toBe(42);
  });

  it('falls back to the heuristic when path is empty', () => {
    expect(resolveCardValue({ value: 99 }, '')).toBe(99);
  });

  it('uses the heuristic on array data with no path', () => {
    expect(resolveCardValue([1, 2, 3, 4], '')).toBe(4);
  });
});

describe('distinctEndpoints', () => {
  it('returns empty for no cards', () => {
    expect(distinctEndpoints([])).toEqual([]);
  });

  it('dedupes cards pointing at the same endpoint via different paths', () => {
    const cards = [
      { data_source: '/api/v1/stats#total' },
      { data_source: '/api/v1/stats#active' },
      { data_source: '/api/v1/stats#this_month' },
    ];
    expect(distinctEndpoints(cards)).toEqual(['/api/v1/stats']);
  });

  it('keeps distinct endpoints separate', () => {
    const cards = [
      { data_source: '/api/v1/a#x' },
      { data_source: '/api/v1/b#y' },
      { data_source: '/api/v1/a#z' },
    ];
    expect(distinctEndpoints(cards).sort()).toEqual([
      '/api/v1/a',
      '/api/v1/b',
    ]);
  });

  it('skips cards with no data_source', () => {
    const cards = [
      { data_source: null },
      { data_source: '/api/v1/a' },
    ];
    expect(distinctEndpoints(cards)).toEqual(['/api/v1/a']);
  });
});
