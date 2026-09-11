import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { textList } from './paymentMca';

/**
 * `IN (...)` versus `= ANY(...)`, which is what broke saving a Payment Request.
 *
 * Drizzle's `sql` tag expands a JS array into a parameter LIST. That is exactly
 * what `IN` wants and exactly what `ANY` does not — `ANY` takes ONE array-typed
 * parameter. Written as `= ANY(${refs})` the reference check compiled to
 * `= ANY(($1))`, so Postgres was handed the string `TCL-EDCOR26-0001` where an
 * array literal belonged and answered 22P02 "malformed array literal". Every
 * save of a request carrying references returned a 500.
 *
 * These assert the compiled SQL, which is the thing that reaches the database.
 */
const dialect = new PgDialect();
const whereIn = (refs: string[]) =>
  dialect.sqlToQuery(sql`upper("mca_ref") IN (${textList(refs)})`);

describe('textList', () => {
  it('binds ONE value as a single-item list', () => {
    const q = whereIn(['TCL-EDCOR26-0001']);
    // Was: upper("mca_ref") = ANY(($1)) → 22P02 on a plain string.
    expect(q.sql).toBe('upper("mca_ref") IN ($1)');
    expect(q.params).toEqual(['TCL-EDCOR26-0001']);
  });

  it('binds several values as separate parameters', () => {
    const q = whereIn(['A-1', 'A-2', 'A-3']);
    expect(q.sql).toBe('upper("mca_ref") IN ($1, $2, $3)');
    expect(q.params).toEqual(['A-1', 'A-2', 'A-3']);
  });

  it('never inlines a value into the SQL text', () => {
    // The reference is operator data; it has to stay a bound parameter.
    const q = whereIn(["O'BRIEN-1", 'X"Y']);
    expect(q.sql).toBe('upper("mca_ref") IN ($1, $2)');
    expect(q.params).toEqual(["O'BRIEN-1", 'X"Y']);
  });

  it('pins why ANY() was wrong: an interpolated array is a parenthesised LIST', () => {
    // This is the exact shape the bug produced. `ANY` needs ONE array-typed
    // parameter, so `ANY(($1))` hands Postgres a bare string where an array
    // literal belongs — 22P02. Keep this assertion: it is the trap, not a
    // description of what the code does now.
    expect(dialect.sqlToQuery(sql`x = ANY(${['A-1', 'A-2']})`).sql).toBe('x = ANY(($1, $2))');
    expect(dialect.sqlToQuery(sql`x = ANY(${['A-1']})`).sql).toBe('x = ANY(($1))');
  });
});
