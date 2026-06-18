import { describe, it, expect } from 'vitest';
import { composeFiche } from './ficheDeCalcul';
import { BadRequestError } from '@/lib/errors';
import type { TaxRuleMasterRow } from '@/db/schema';

// computeFiche is the DB-bound wrapper that's exercised in integration.
// These tests target composeFiche — the pure rule-composition core.

function rule(overrides: Partial<TaxRuleMasterRow>): TaxRuleMasterRow {
  return {
    id: 1,
    ruleKey: 'r',
    name: 'Rule',
    description: null,
    jurisdiction: null,
    scope: null,
    formula: 0,
    effectiveFrom: null,
    effectiveTo: null,
    displayOrder: 0,
    display: 'Y',
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const ASOF = new Date('2026-06-18T00:00:00Z');

describe('composeFiche', () => {
  it('runs one rule and returns its line + total', () => {
    const result = composeFiche({
      entity: { amount: 100 },
      rules: [
        rule({
          ruleKey: 'drc.vat.standard',
          name: 'VAT',
          scope: 'vat',
          formula: { '*': [{ var: 'entity.amount' }, 0.16] },
        }),
      ],
      asOf: ASOF,
    });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      ruleKey: 'drc.vat.standard',
      name: 'VAT',
      scope: 'vat',
      value: 16,
    });
    expect(result.total).toBe(16);
    expect(result.asOf).toBe('2026-06-18');
  });

  it('sums numeric values across multiple rules', () => {
    const result = composeFiche({
      entity: { amount: 1000 },
      rules: [
        rule({
          ruleKey: 'duty',
          formula: { '*': [{ var: 'entity.amount' }, 0.1] }, // 100
        }),
        rule({
          ruleKey: 'vat',
          formula: { '*': [{ var: 'entity.amount' }, 0.16] }, // 160
        }),
        rule({
          ruleKey: 'fee',
          formula: { max: [{ '*': [{ var: 'entity.amount' }, 0.005] }, 10] }, // max(5, 10) = 10
        }),
      ],
      asOf: ASOF,
    });
    expect(result.lines.map((l) => l.value)).toEqual([100, 160, 10]);
    expect(result.total).toBe(270);
  });

  it('preserves rule ordering in the output lines', () => {
    const result = composeFiche({
      entity: { amount: 1 },
      rules: [
        rule({ ruleKey: 'c', formula: 3 }),
        rule({ ruleKey: 'a', formula: 1 }),
        rule({ ruleKey: 'b', formula: 2 }),
      ],
      asOf: ASOF,
    });
    expect(result.lines.map((l) => l.ruleKey)).toEqual(['c', 'a', 'b']);
  });

  it('flags non-numeric formula results without throwing', () => {
    const result = composeFiche({
      entity: { amount: 100 },
      rules: [
        rule({ ruleKey: 'good', formula: 50 }),
        rule({ ruleKey: 'bad',  formula: 'oops' }),
      ],
      asOf: ASOF,
    });
    expect(result.lines[0]).toMatchObject({ value: 50 });
    expect(result.lines[1].value).toBeNull();
    expect(result.lines[1].error).toMatch(/non-numeric/);
    // Non-numeric lines contribute 0 to the total, not NaN
    expect(result.total).toBe(50);
  });

  it('treats NaN / Infinity as non-numeric', () => {
    const result = composeFiche({
      entity: { amount: 0 },
      rules: [
        // Divide-by-zero in JSON Logic produces null per spec, but force the
        // case explicitly with a literal Infinity-producing op
        rule({ ruleKey: 'nan', formula: { '/': [1, 0] } }),
      ],
      asOf: ASOF,
    });
    expect(result.lines[0].value).toBeNull();
    expect(result.lines[0].error).toBeTruthy();
    expect(result.total).toBe(0);
  });

  it('passes entity context through to the formula', () => {
    const result = composeFiche({
      entity: { amount: 50, weight_kg: 200 } as Parameters<typeof composeFiche>[0]['entity'],
      rules: [
        rule({
          ruleKey: 'per_kg',
          formula: { '*': [{ var: 'entity.weight_kg' }, 2.5] },
        }),
      ],
      asOf: ASOF,
    });
    expect(result.lines[0].value).toBe(500);
  });

  it('throws BadRequestError when rules is empty', () => {
    expect(() =>
      composeFiche({
        entity: { amount: 100 },
        rules: [],
        asOf: ASOF,
      }),
    ).toThrow(BadRequestError);
  });

  it('formats asOf as ISO date (YYYY-MM-DD)', () => {
    const result = composeFiche({
      entity: { amount: 1 },
      rules: [rule({ formula: 1 })],
      asOf: new Date('2025-12-31T23:59:59Z'),
    });
    expect(result.asOf).toBe('2025-12-31');
  });
});
