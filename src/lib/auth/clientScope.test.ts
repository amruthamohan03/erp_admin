import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ALL, NOTHING, clientScopeCondition, scopeAllowsClient, type ClientScope } from './clientScope';
import { importT } from '@/db/schema';

// §4.7 — the row-level scoping rule. Pure, so it is pinned without a database.
//
// What matters here is not that the SQL is pretty but that the three scopes can
// never be mistaken for one another: `all` must widen to nothing, `none` must
// narrow to nothing, and a client must compare against its own id only.

const dialect = new PgDialect();
const render = (scope: ClientScope) => dialect.sqlToQuery(clientScopeCondition(scope, importT.clientId));

const CLIENT: ClientScope = { kind: 'client', clientId: 42 };

describe('clientScopeCondition', () => {
  it('lets staff see everything', () => {
    expect(render(ALL).sql).toBe('true');
  });

  // The whole feature. A client scope must compare the table's own client
  // column, and must BIND the id rather than inline it.
  it('narrows a client login to its own client', () => {
    const q = render(CLIENT);
    expect(q.sql).toContain('"imports_t"."client_id"');
    expect(q.params).toEqual([42]);
    expect(q.sql).not.toContain('42');
  });

  // The failure that would matter: an unresolvable account seeing everything.
  it('shows an unresolvable account nothing, never everything', () => {
    expect(render(NOTHING).sql).toBe('false');
    expect(render(NOTHING).sql).not.toBe('true');
  });

  it('returns a real predicate for staff rather than nothing at all', () => {
    // `and(undefined)` silently drops a clause; a literal TRUE cannot.
    expect(render(ALL).sql.trim()).not.toBe('');
  });

  it('applies to whichever client column it is handed', () => {
    const onExports = new PgDialect().sqlToQuery(
      clientScopeCondition(CLIENT, importT.clientId),
    );
    expect(onExports.sql).toContain('client_id');
  });
});

describe('scopeAllowsClient', () => {
  it('lets staff open any record', () => {
    expect(scopeAllowsClient(ALL, 7)).toBe(true);
    expect(scopeAllowsClient(ALL, null)).toBe(true);
  });

  it('lets a client open only its own', () => {
    expect(scopeAllowsClient(CLIENT, 42)).toBe(true);
    expect(scopeAllowsClient(CLIENT, 43)).toBe(false);
  });

  // A record with no client carries no owner, so no client login can claim it.
  it('refuses a client a record that belongs to nobody', () => {
    expect(scopeAllowsClient(CLIENT, null)).toBe(false);
    expect(scopeAllowsClient(CLIENT, undefined)).toBe(false);
  });

  it('refuses an unresolvable account everything', () => {
    expect(scopeAllowsClient(NOTHING, 42)).toBe(false);
    expect(scopeAllowsClient(NOTHING, null)).toBe(false);
  });

  it('compares numerically, so a string id from a query still matches', () => {
    expect(scopeAllowsClient(CLIENT, '42' as unknown as number)).toBe(true);
  });
});
