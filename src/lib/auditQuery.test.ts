import { describe, it, expect } from 'vitest';
import { auditListQuerySchema, parseAuditQuery, AUDIT_MENU } from '@/schemas/audit-log';

// §4.28 — the list, the stats and the export all parse the request with this one
// function, which is what keeps the three describing the same set of rows. A
// divergence here means the KPI cards count something the table does not show.

describe('parseAuditQuery', () => {
  const parse = (qs: string) => parseAuditQuery(new URLSearchParams(qs));

  it('defaults to the first page when nothing is asked for', () => {
    const q = parse('');
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(25);
    expect(q.q).toBeUndefined();
    expect(q.module).toBeUndefined();
  });

  it('coerces the numeric params out of the query string', () => {
    const q = parse('page=3&pageSize=50&actorId=7');
    expect(q.page).toBe(3);
    expect(q.pageSize).toBe(50);
    expect(q.actorId).toBe(7);
  });

  // An empty param is what a cleared dropdown sends. Treating '' as a filter
  // value would search for a module literally named '' and return nothing.
  it('treats a blank param as absent, not as an empty filter', () => {
    const q = parse('module=&action=&q=&actorId=');
    expect(q.module).toBeUndefined();
    expect(q.action).toBeUndefined();
    expect(q.q).toBeUndefined();
    expect(q.actorId).toBeUndefined();
  });

  it('keeps the filters it is given', () => {
    const q = parse('q=smith&module=license&action=delete&from=2026-01-01&to=2026-01-31');
    expect(q).toMatchObject({
      q: 'smith',
      module: 'license',
      action: 'delete',
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('rejects a date that is not YYYY-MM-DD, and says so (§4.23)', () => {
    const bad = auditListQuerySchema.safeParse({ from: '31/01/2026' });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0]?.message).toContain('YYYY-MM-DD');
    }
  });

  // The export reuses this parser, so an unbounded pageSize would let one click
  // pull the whole table into a spreadsheet request.
  it('caps pageSize', () => {
    expect(auditListQuerySchema.safeParse({ pageSize: 1000 }).success).toBe(false);
    expect(auditListQuerySchema.safeParse({ pageSize: 200 }).success).toBe(true);
  });
});

describe('AUDIT_MENU', () => {
  // §4.7 — the permission resource IS the menu URL, so this string has to match
  // the row migration 0055 inserts into menu_master_t.
  it('is the menu url the permission rows hang off', () => {
    expect(AUDIT_MENU).toBe('/audit-log');
  });
});
