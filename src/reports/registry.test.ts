import { describe, it, expect } from 'vitest';
import { getReportHandler, listRegisteredReportKeys } from './registry';
import { reportColumnsSchema, reportColumnSchema } from './types';
import { ZodError } from 'zod';

// The registry + column schema are pure — runReport itself is DB-bound
// and falls under integration coverage. These tests pin the registry's
// contract so a typo in handler wiring (or a renamed handler module)
// surfaces immediately.

describe('report registry', () => {
  it('exposes a handler for every seeded report_key', () => {
    // Keys here must match every reportKey in
    // src/db/seed/reportDefinitions.ts — runReport throws if the master
    // row references a key without a handler entry.
    expect(listRegisteredReportKeys()).toEqual(
      expect.arrayContaining([
        'licenses-by-state',
        'invoices-outstanding',
        'tracking-in-progress',
      ]),
    );
  });

  it('returns null for an unknown key', () => {
    expect(getReportHandler('not-a-real-report')).toBeNull();
  });

  it('returns an entry with a callable handler', () => {
    const entry = getReportHandler('licenses-by-state');
    expect(entry).not.toBeNull();
    expect(typeof entry!.handler).toBe('function');
  });
});

describe('reportColumnSchema', () => {
  it('accepts a minimal column', () => {
    expect(() =>
      reportColumnSchema.parse({ key: 'state', label: 'State', type: 'text' }),
    ).not.toThrow();
  });

  it('accepts the optional align field', () => {
    expect(() =>
      reportColumnSchema.parse({
        key: 'amount',
        label: 'Amount',
        type: 'money',
        align: 'right',
      }),
    ).not.toThrow();
  });

  it('rejects unknown type values', () => {
    expect(() =>
      reportColumnSchema.parse({
        key: 'x',
        label: 'X',
        type: 'weird_type',
      }),
    ).toThrow(ZodError);
  });

  it('rejects unknown align values', () => {
    expect(() =>
      reportColumnSchema.parse({
        key: 'x',
        label: 'X',
        type: 'text',
        align: 'wonky',
      }),
    ).toThrow(ZodError);
  });

  it('rejects missing label', () => {
    expect(() =>
      reportColumnSchema.parse({ key: 'x', type: 'text' }),
    ).toThrow(ZodError);
  });
});

describe('reportColumnsSchema', () => {
  it('accepts a non-empty array', () => {
    expect(() =>
      reportColumnsSchema.parse([
        { key: 'a', label: 'A', type: 'text' },
        { key: 'b', label: 'B', type: 'number' },
      ]),
    ).not.toThrow();
  });

  it('rejects an empty array (every report needs at least one column)', () => {
    expect(() => reportColumnsSchema.parse([])).toThrow(ZodError);
  });

  it('rejects a non-array', () => {
    expect(() => reportColumnsSchema.parse({ not: 'array' })).toThrow(ZodError);
  });
});
