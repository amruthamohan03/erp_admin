import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { bindColumnValue } from './targets';

/**
 * How a value is BOUND, not what it renders to — the distinction that broke
 * export tracking.
 *
 * Drizzle's `sql` tag treats a JS array as a parameter LIST, because that is what
 * an `IN (…)` needs. Interpolated into a column assignment it produced
 * `remarks = ()` for an empty array — a Postgres syntax error — so any export or
 * import carrying a remark-log column failed to save, and one that had never had
 * a remark failed hardest: it could not be updated at all. A populated log was no
 * better: `remarks = ($1, $2)`.
 *
 * These assert the compiled SQL, which is the thing that reaches the database.
 */
const dialect = new PgDialect();
const assign = (v: unknown) =>
  dialect.sqlToQuery(sql`${sql.identifier('remarks')} = ${bindColumnValue(v)}`);

describe('bindColumnValue', () => {
  it('binds an EMPTY jsonb array as one parameter, not an empty list', () => {
    const q = assign([]);
    expect(q.sql).toBe('"remarks" = $1'); // was: "remarks" = ()
    expect(q.params).toEqual(['[]']);
  });

  it('binds a populated jsonb array as one parameter, not N of them', () => {
    const log = [
      { date: '2026-09-08', remark: 'First' },
      { date: '2026-09-09', remark: 'Second' },
    ];
    const q = assign(log);
    expect(q.sql).toBe('"remarks" = $1'); // was: "remarks" = ($1, $2)
    expect(q.params).toEqual([JSON.stringify(log)]);
  });

  it('binds a jsonb object as one parameter', () => {
    expect(assign({ a: 1 }).params).toEqual(['{"a":1}']);
  });

  it.each([
    ['a string', 'TCL-001', 'TCL-001'],
    ['a number', 12, 12],
    ['zero', 0, 0],
    ['false', false, false],
  ])('passes %s through untouched', (_label, input, expected) => {
    const q = assign(input);
    expect(q.sql).toBe('"remarks" = $1');
    expect(q.params).toEqual([expected]);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('binds %s as NULL, so clearing a column stays possible', (_label, input) => {
    expect(assign(input).params).toEqual([null]);
  });

  it('does not JSON-stringify a Date — a timestamp column takes the value itself', () => {
    const d = new Date('2026-09-08T00:00:00Z');
    expect(assign(d).params).toEqual([d]);
  });
});
