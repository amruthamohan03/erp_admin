import { describe, expect, it } from 'vitest';
import {
  IMPORT_DATE_FIELDS,
  IMPORT_MISSING_CARD_FIELDS,
  IMPORT_PIPELINE_STEPS,
  importDateField,
  isImportDateField,
} from './importDateFields';
import {
  ROAD_MILESTONES,
  ROAD_JOURNEY_END,
  isRoadMilestone,
  previousMilestone,
} from './roadMilestones';

// These lists are addressed with `sql.identifier` and rendered as column
// headers, so a duplicate or a stray key is a broken query or a broken table
// rather than a cosmetic problem.

describe('the import date fields', () => {
  it('has a unique key per field', () => {
    const keys = IMPORT_DATE_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has a unique short label, since they head adjacent columns', () => {
    const shorts = IMPORT_DATE_FIELDS.map((f) => f.short);
    expect(new Set(shorts).size).toBe(shorts.length);
  });

  // Every key reaches `sql.identifier` on `imports_t`, so anything that is not
  // a plain snake_case column name is a defect waiting to happen.
  it('names only plain snake_case columns', () => {
    for (const f of IMPORT_DATE_FIELDS) {
      expect(f.key).toMatch(/^[a-z][a-z0-9_]*$/u);
    }
  });

  it('scopes exactly the two airport dates to air', () => {
    const air = IMPORT_DATE_FIELDS.filter((f) => f.transportLetter === 'A').map((f) => f.key);
    expect(air).toEqual(['airport_arrival_date', 'dispatch_from_airport']);
  });

  it('offers every field as a card except the Pre Alert anchor', () => {
    expect(IMPORT_MISSING_CARD_FIELDS).toHaveLength(IMPORT_DATE_FIELDS.length - 1);
    expect(IMPORT_MISSING_CARD_FIELDS.some((f) => f.key === 'pre_alert_date')).toBe(false);
  });

  it('looks a field up by key and rejects anything else', () => {
    expect(importDateField('quittance_date')?.label).toBe('Quittance Date');
    expect(importDateField('not_a_column')).toBeUndefined();
    expect(isImportDateField('dgda_in_date')).toBe(true);
    expect(isImportDateField('dgda_in')).toBe(false);
  });
});

describe('the clearance pipeline', () => {
  // The three counts must be disjoint, which is what makes them add up to
  // something an operator can act on. Each step depends on every earlier step's
  // date being present, so the chain has to be strictly cumulative.
  it('requires every earlier gate, in order', () => {
    const missing = IMPORT_PIPELINE_STEPS.map((s) => s.missing);
    IMPORT_PIPELINE_STEPS.forEach((step, i) => {
      expect(step.after).toEqual(missing.slice(0, i));
    });
  });

  it('names a real date field at every gate', () => {
    for (const step of IMPORT_PIPELINE_STEPS) {
      expect(isImportDateField(step.missing)).toBe(true);
      for (const a of step.after) expect(isImportDateField(a)).toBe(true);
    }
  });
});

describe('the road journey', () => {
  it('has a unique key and column per leg', () => {
    expect(new Set(ROAD_MILESTONES.map((m) => m.key)).size).toBe(ROAD_MILESTONES.length);
    expect(new Set(ROAD_MILESTONES.map((m) => m.column)).size).toBe(ROAD_MILESTONES.length);
  });

  it('tracks columns that are also tracked date fields', () => {
    for (const m of ROAD_MILESTONES) expect(isImportDateField(m.column)).toBe(true);
  });

  // "Waiting at leg i" is defined as leg i empty and leg i-1 filled, so the
  // first leg must have no predecessor or the whole chain shifts by one.
  it('gives the first leg no predecessor and every other one its neighbour', () => {
    expect(previousMilestone(ROAD_MILESTONES[0].key)).toBeNull();
    for (let i = 1; i < ROAD_MILESTONES.length; i++) {
      expect(previousMilestone(ROAD_MILESTONES[i].key)).toEqual(ROAD_MILESTONES[i - 1]);
    }
  });

  it('ends the journey at the final warehouse arrival', () => {
    expect(ROAD_JOURNEY_END.column).toBe('warehouse_arrival_date');
  });

  it('rejects a key it does not declare', () => {
    expect(isRoadMilestone('drc_entry')).toBe(true);
    expect(isRoadMilestone('drc_entry_date')).toBe(false);
  });
});
