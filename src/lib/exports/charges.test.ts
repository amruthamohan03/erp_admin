import { describe, expect, it } from 'vitest';
import {
  computeExportCharges,
  EXPORT_CHARGE_COLUMNS,
  type ExportChargeColumn,
} from './charges';

describe('computeExportCharges', () => {
  const ctx = {
    weight: 20,
    fob: 100_000,
    type_of_goods_id: 1,
    feet_container_id: null,
  };

  it('returns all-null when no rules are supplied', () => {
    const out = computeExportCharges(new Map(), ctx);
    for (const col of EXPORT_CHARGE_COLUMNS) {
      expect(out[col]).toBeNull();
    }
  });

  it('evaluates a $2/MT rule against weight', () => {
    // 20 MT × $2 = $40.00 → 2 dp string.
    const rules = new Map<ExportChargeColumn, unknown>([
      ['ceec_amount', { '*': [{ var: 'weight' }, 2] }],
    ]);
    const out = computeExportCharges(rules, ctx);
    expect(out.ceec_amount).toBe('40.00');
    expect(out.cgea_amount).toBeNull();
  });

  it('evaluates a percent-of-FOB rule', () => {
    // 0.4 % of 100 000 = 400.00
    const rules = new Map<ExportChargeColumn, unknown>([
      ['cgea_amount', { '*': [{ var: 'fob' }, 0.004] }],
    ]);
    const out = computeExportCharges(rules, ctx);
    expect(out.cgea_amount).toBe('400.00');
  });

  it('rounds to 2 decimal places (fixed notation, not toString)', () => {
    // 0.0059 × 100 000 = 590.00 exact — but a rule that produces
    // an irrational-looking float still lands on 2 dp.
    const rules = new Map<ExportChargeColumn, unknown>([
      ['ogefrem_amount', { '*': [{ var: 'fob' }, 0.005949] }],
    ]);
    const out = computeExportCharges(rules, ctx);
    // 0.005949 * 100000 = 594.9 → "594.90"
    expect(out.ogefrem_amount).toBe('594.90');
  });

  it('skips a rule that evaluates to a non-finite number', () => {
    // Division by zero → Infinity → we drop it to null so a bad
    // rule doesn't crash the whole bulk-create.
    const rules = new Map<ExportChargeColumn, unknown>([
      ['occ_amount', { '/': [{ var: 'fob' }, 0] }],
    ]);
    const out = computeExportCharges(rules, ctx);
    expect(out.occ_amount).toBeNull();
  });

  it('drops null/undefined evaluations without erroring', () => {
    const rules = new Map<ExportChargeColumn, unknown>([
      // JSON Logic `if` with a false branch returns null when
      // nothing matches. Simulate: always false → null.
      ['lmc_amount', { if: [false, 999] }],
    ]);
    const out = computeExportCharges(rules, ctx);
    expect(out.lmc_amount).toBeNull();
  });
});
