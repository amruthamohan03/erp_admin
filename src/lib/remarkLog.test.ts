import { describe, it, expect } from 'vitest';
import { importBodySchema } from '@/schemas/imports';
import { todayIso, formatDate } from '@/lib/formatDate';

// Import Tracking's Remarks is a dated log, not a paragraph: many entries, each
// with its own date. Stored as JSONB on the row, the same way the payment
// request's MCA lines are.

const parse = (remarks: unknown) => importBodySchema.safeParse({ remarks });

describe('remarks log validation', () => {
  it('accepts a log of dated entries', () => {
    const r = parse([
      { date: '2026-08-30', remark: 'Pre-alert received.' },
      { date: '2026-09-01', remark: 'Cleared at the border.' },
    ]);
    expect(r.success).toBe(true);
  });

  it('accepts an empty log — a consignment need not have remarks', () => {
    expect(parse([]).success).toBe(true);
  });

  // §4.23 — the message names the field and the fix, not "Invalid input".
  it('rejects a date that is not YYYY-MM-DD and says so', () => {
    const r = parse([{ date: '01/09/2026', remark: 'x' }]);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toContain('YYYY-MM-DD');
  });

  it('rejects an empty remark, naming that as the problem', () => {
    const r = parse([{ date: '2026-09-01', remark: '' }]);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('A remark cannot be empty.');
  });

  it('rejects an entry with no date at all', () => {
    expect(parse([{ remark: 'orphan' }]).success).toBe(false);
  });

  // An unbounded array on a JSONB column is a way to make one row enormous.
  it('caps the log length', () => {
    const many = Array.from({ length: 201 }, () => ({ date: '2026-09-01', remark: 'x' }));
    const r = parse(many);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toContain('at most 200');
  });

  it('still allows the field to be absent or null', () => {
    expect(importBodySchema.safeParse({}).success).toBe(true);
    expect(parse(null).success).toBe(true);
  });
});

describe('todayIso', () => {
  it('returns the LOCAL calendar day, not the UTC one', () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(todayIso()).toBe(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    );
  });

  // The whole point: `toISOString().slice(0,10)` returns the UTC day, which is
  // the wrong date for part of every day in Kinshasa (UTC+1) and everywhere else
  // off the meridian.
  it('is a valid input value that round-trips through the display formatter', () => {
    const iso = todayIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    const [y, m, d] = iso.split('-');
    expect(formatDate(iso)).toBe(`${d}-${m}-${y}`);
  });
});
