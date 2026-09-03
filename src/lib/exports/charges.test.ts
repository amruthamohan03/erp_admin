import { describe, expect, it } from 'vitest';
import {
  computeExportCharges,
  EXPORT_CHARGE_COLUMNS,
  type ExportChargeColumn,
  type ExportChargeRule,
} from './charges';

/** A tax-rule entry — the JSON Logic half of the resolver. */
const taxRule = (formula: unknown): ExportChargeRule => ({ source: 'tax_rule', formula });

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
    const rules = new Map<ExportChargeColumn, ExportChargeRule>([
      ['ceec_amount', taxRule({ '*': [{ var: 'weight' }, 2] })],
    ]);
    const out = computeExportCharges(rules, ctx);
    expect(out.ceec_amount).toBe('40.00');
    expect(out.cgea_amount).toBeNull();
  });

  it('evaluates a percent-of-FOB rule', () => {
    // 0.4 % of 100 000 = 400.00
    const rules = new Map<ExportChargeColumn, ExportChargeRule>([
      ['cgea_amount', taxRule({ '*': [{ var: 'fob' }, 0.004] })],
    ]);
    const out = computeExportCharges(rules, ctx);
    expect(out.cgea_amount).toBe('400.00');
  });

  it('rounds to 2 decimal places (fixed notation, not toString)', () => {
    // 0.0059 × 100 000 = 590.00 exact — but a rule that produces
    // an irrational-looking float still lands on 2 dp.
    const rules = new Map<ExportChargeColumn, ExportChargeRule>([
      ['ogefrem_amount', taxRule({ '*': [{ var: 'fob' }, 0.005949] })],
    ]);
    const out = computeExportCharges(rules, ctx);
    // 0.005949 * 100000 = 594.9 → "594.90"
    expect(out.ogefrem_amount).toBe('594.90');
  });

  it('skips a rule that evaluates to a non-finite number', () => {
    // Division by zero → Infinity → we drop it to null so a bad
    // rule doesn't crash the whole bulk-create.
    const rules = new Map<ExportChargeColumn, ExportChargeRule>([
      ['occ_amount', taxRule({ '/': [{ var: 'fob' }, 0] })],
    ]);
    const out = computeExportCharges(rules, ctx);
    expect(out.occ_amount).toBeNull();
  });

  it('drops null/undefined evaluations without erroring', () => {
    const rules = new Map<ExportChargeColumn, ExportChargeRule>([
      // JSON Logic `if` with a false branch returns null when
      // nothing matches. Simulate: always false → null.
      ['lmc_amount', taxRule({ if: [false, 999] })],
    ]);
    const out = computeExportCharges(rules, ctx);
    expect(out.lmc_amount).toBeNull();
  });
});

// ── The page-field `tiered` fallback ────────────────────────────────────────
//
// These specs are the ones actually stored on the export page's amount fields,
// and are what the single-record form evaluates. The resolver reads them when
// tax_rule_master_t has nothing for a column — which today is every column, so
// this is the path that runs in production.
describe('computeExportCharges from a page-field derive', () => {
  const derive = (spec: unknown): ExportChargeRule => ({ source: 'field_derive', spec });

  const CEEC = derive({
    kind: 'tiered',
    rules: [{ when: { not: { lt: 30, field: 'weight' } }, value: 800 }],
    default: { value: 600 },
  });
  const LMC = derive({
    kind: 'tiered',
    base: 'weight',
    rules: [{ rate: 8, when: { eq: 8, field: 'type_of_goods' } }],
    default: { rate: 5 },
  });
  const OGEFREM = derive({
    kind: 'tiered',
    base: 'weight',
    rules: [
      { when: { eq: 1, field: 'feet_container' }, value: 50 },
      { when: { in: [2, 3], field: 'feet_container' }, value: 100 },
      { when: { eq: 4, field: 'feet_container' }, value: 150 },
      { rate: 3, when: { eq: 5, field: 'feet_container' } },
    ],
  });

  const at = (weight: number, goods: number | null, feet: number | null) =>
    computeExportCharges(
      new Map<ExportChargeColumn, ExportChargeRule>([
        ['ceec_amount', CEEC],
        ['lmc_amount', LMC],
        ['ogefrem_amount', OGEFREM],
        ['cgea_amount', derive({ kind: 'tiered', rules: [], default: { value: 80 } })],
        ['occ_amount', derive({ kind: 'tiered', rules: [], default: { value: 250 } })],
      ]),
      { weight, fob: 0, type_of_goods_id: goods, feet_container_id: feet },
    );

  it('applies the CEEC weight threshold at 30 MT', () => {
    expect(at(29.999, 1, null).ceec_amount).toBe('600.00');
    expect(at(30, 1, null).ceec_amount).toBe('800.00');
    expect(at(45, 1, null).ceec_amount).toBe('800.00');
  });

  it('charges LMC per MT, at the higher rate for goods type 8', () => {
    expect(at(20, 1, null).lmc_amount).toBe('100.00'); // 20 × 5
    expect(at(20, 8, null).lmc_amount).toBe('160.00'); // 20 × 8
  });

  it('reads OGEFREM off the container size, per MT for V RAC', () => {
    expect(at(20, 1, 1).ogefrem_amount).toBe('50.00');
    expect(at(20, 1, 2).ogefrem_amount).toBe('100.00');
    expect(at(20, 1, 3).ogefrem_amount).toBe('100.00');
    expect(at(20, 1, 4).ogefrem_amount).toBe('150.00');
    expect(at(20, 1, 5).ogefrem_amount).toBe('60.00'); // 20 × 3
  });

  it('leaves OGEFREM unset when no container is chosen', () => {
    // The stored spec has no `default`, so nothing matches and the column stays
    // null rather than defaulting to a charge nobody configured.
    expect(at(20, 1, null).ogefrem_amount).toBeNull();
  });

  it('charges the two flat fees once the row carries goods', () => {
    expect(at(1, null, null).cgea_amount).toBe('80.00');
    expect(at(999, 8, 4).occ_amount).toBe('250.00');
  });

  it('starts every weight-driven charge at zero while the row has no weight', () => {
    // A blank row is not a consignment yet. Left ungated it carried the flat
    // fees and the base tier — CEEC 600 + CGEA 80 + OCC 250 — so adding five
    // rows and filling two would have written 930 of charges onto each of the
    // three left empty.
    const empty = at(0, null, null);
    expect(empty.ceec_amount).toBe('0.00');
    expect(empty.cgea_amount).toBe('0.00');
    expect(empty.occ_amount).toBe('0.00');
    expect(empty.lmc_amount).toBe('0.00');
  });

  it('leaves OGEFREM to the container, not the weight', () => {
    // Not gated: it is chosen by container size, and a weightless row with a
    // 20-foot container still owes the container fee.
    expect(at(0, null, 1).ogefrem_amount).toBe('50.00');
    expect(at(0, null, null).ogefrem_amount).toBeNull();
  });

  it('resumes the configured rates as soon as a weight is entered', () => {
    expect(at(0, 1, 5).ceec_amount).toBe('0.00');
    expect(at(25, 1, 5).ceec_amount).toBe('600.00');
    expect(at(25, 1, 5).lmc_amount).toBe('125.00');
  });

  it('resolves a rule written against either field vocabulary', () => {
    // A tax rule names the row's columns (`type_of_goods_id`); a page derive
    // names the form's fields (`type_of_goods`). Both must reach the same value.
    const byRowName = computeExportCharges(
      new Map<ExportChargeColumn, ExportChargeRule>([
        ['lmc_amount', taxRule({ '*': [{ var: 'type_of_goods_id' }, 10] })],
      ]),
      { weight: 1, fob: 0, type_of_goods_id: 8, feet_container_id: null },
    );
    expect(byRowName.lmc_amount).toBe('80.00');
    expect(at(1, 8, null).lmc_amount).toBe('8.00');
  });
});
