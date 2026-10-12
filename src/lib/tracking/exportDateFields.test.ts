import { describe, expect, it } from 'vitest';
import {
  EXPORT_AGENCIES,
  EXPORT_DATE_FIELDS,
  EXPORT_JOURNEY_END,
  EXPORT_MILESTONES,
  EXPORT_PROCESSING_SPANS,
  EXPORT_REPORT_KEYS,
  EXPORT_TIMELINE_SPANS,
  EXPORT_TRANSIT_SPANS,
  exportDateField,
  isExportDateField,
} from './exportDateFields';

// These lists are addressed with `sql.identifier` and rendered as column
// headers, so a duplicate or a stray key is a broken query or a broken table
// rather than a cosmetic problem.

describe('the export date fields', () => {
  it('has a unique key and short label per field', () => {
    const keys = EXPORT_DATE_FIELDS.map((f) => f.key);
    const shorts = EXPORT_DATE_FIELDS.map((f) => f.short);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(shorts).size).toBe(shorts.length);
  });

  // Every key reaches `sql.identifier` on `exports_t`, so anything that is not
  // a plain snake_case column name is a defect waiting to happen.
  it('names only plain snake_case columns', () => {
    for (const f of EXPORT_DATE_FIELDS) expect(f.key).toMatch(/^[a-z][a-z0-9_]*$/u);
  });

  it('looks a field up by key and rejects anything else', () => {
    expect(exportDateField('quittance_date')?.label).toBe('Quittance Date');
    expect(exportDateField('not_a_column')).toBeUndefined();
    expect(isExportDateField('exit_drc_date')).toBe(true);
    expect(isExportDateField('exit_drc')).toBe(false);
  });
});

describe('every span names a tracked date field', () => {
  // A span naming a column that is not in the list would still run, but it
  // could never be filtered on or exported, which is how the two drift.
  it.each([
    ['timeline', EXPORT_TIMELINE_SPANS],
    ['transit', EXPORT_TRANSIT_SPANS],
    ['processing', EXPORT_PROCESSING_SPANS],
  ] as const)('%s', (_name, list) => {
    for (const s of list) {
      expect(isExportDateField(s.from)).toBe(true);
      expect(isExportDateField(s.to)).toBe(true);
    }
  });

  it('measures each span forwards, never backwards', () => {
    const order = EXPORT_DATE_FIELDS.map((f) => f.key);
    for (const s of [...EXPORT_TRANSIT_SPANS, ...EXPORT_PROCESSING_SPANS]) {
      expect(order.indexOf(s.from)).toBeLessThan(order.indexOf(s.to));
    }
  });
});

describe('the export journey', () => {
  it('has a unique key and column per leg, all of them tracked fields', () => {
    expect(new Set(EXPORT_MILESTONES.map((m) => m.key)).size).toBe(EXPORT_MILESTONES.length);
    expect(new Set(EXPORT_MILESTONES.map((m) => m.column)).size).toBe(EXPORT_MILESTONES.length);
    for (const m of EXPORT_MILESTONES) expect(isExportDateField(m.column)).toBe(true);
  });

  // "Waiting at leg i" is defined as leg i empty and leg i-1 filled, so the
  // legs must be in the order they actually happen or the chain is nonsense.
  it('lists the legs in the order they occur', () => {
    const order = EXPORT_DATE_FIELDS.map((f) => f.key);
    for (let i = 1; i < EXPORT_MILESTONES.length; i++) {
      expect(order.indexOf(EXPORT_MILESTONES[i - 1].column)).toBeLessThan(
        order.indexOf(EXPORT_MILESTONES[i].column),
      );
    }
  });

  it('ends the journey at the DRC exit', () => {
    expect(EXPORT_JOURNEY_END.column).toBe('exit_drc_date');
  });
});

describe('the agencies', () => {
  it('has a unique key and fee column each', () => {
    expect(new Set(EXPORT_AGENCIES.map((a) => a.key)).size).toBe(EXPORT_AGENCIES.length);
    expect(new Set(EXPORT_AGENCIES.map((a) => a.amount)).size).toBe(EXPORT_AGENCIES.length);
    for (const a of EXPORT_AGENCIES) expect(a.amount).toMatch(/^[a-z][a-z0-9_]*_amount$/u);
  });

  it('names tracked date fields where it bounds a processing time', () => {
    for (const a of EXPORT_AGENCIES) {
      if (a.from) expect(isExportDateField(a.from)).toBe(true);
      if (a.to) expect(isExportDateField(a.to)).toBe(true);
    }
  });
});

describe('the report keys', () => {
  // They live apart from the registry that holds each report's columns and SQL
  // — the registry imports the database, and this schema is parsed in the
  // browser too, so importing one from the other pulled the pg driver into the
  // client bundle and broke the build. The split is what this test guards.
  it('are unique and plain slugs', () => {
    expect(new Set(EXPORT_REPORT_KEYS).size).toBe(EXPORT_REPORT_KEYS.length);
    for (const k of EXPORT_REPORT_KEYS) expect(k).toMatch(/^[a-z][a-z0-9-]*$/u);
  });

  // Completeness is proven by the compiler rather than asserted here: the
  // registry is a `Record<ExportReportKey, …>`, so a key declared above and not
  // registered is a type error. Importing the registry into this test would
  // open a database pool for a list comparison.
  it('covers the five reports the design offers', () => {
    expect([...EXPORT_REPORT_KEYS]).toEqual(['ogefrem', 'lmc', 'ceec', 'quittance', 'dispatch']);
  });
});
