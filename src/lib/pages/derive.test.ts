import { describe, expect, it } from 'vitest';
import { computePureDerive, type FormulaDerive } from './derive';

const f = (op: FormulaDerive['op'], fields: string[], decimals?: number): FormulaDerive => ({
  kind: 'formula',
  op,
  fields,
  ...(decimals === undefined ? {} : { decimals }),
});

describe('formula derive', () => {
  it('sums every operand, blanks counting as 0 — CIF = FOB + Fret + Assurance + Autres', () => {
    const values = { fob_usd: '1000', fret_usd: '250.5', assurance_usd: '', autres_charges_usd: null };
    expect(
      computePureDerive(f('sum', ['fob_usd', 'fret_usd', 'assurance_usd', 'autres_charges_usd']), values),
    ).toBe(1250.5);
  });

  it('subtracts left to right', () => {
    expect(computePureDerive(f('subtract', ['a', 'b', 'c']), { a: 10, b: 3, c: 2 })).toBe(5);
  });

  it('multiplies — CIF (CDF) = CIF (USD) × DGDA rate', () => {
    expect(computePureDerive(f('multiply', ['cif_usd', 'rate']), { cif_usd: '1250.5', rate: '2800' })).toBe(3501400);
  });

  it('a product with a blank operand is 0, not the other operand', () => {
    expect(computePureDerive(f('multiply', ['cif_usd', 'rate']), { cif_usd: '1250.5', rate: '' })).toBe(0);
  });

  it('rounds to the configured decimals, and only when asked', () => {
    const values = { a: '0.1', b: '0.2' };
    expect(computePureDerive(f('sum', ['a', 'b'], 2), values)).toBe(0.3);
    expect(computePureDerive(f('multiply', ['a', 'b'], 2), { a: '1.2345', b: '2' })).toBe(2.47);
    expect(computePureDerive(f('sum', ['a', 'b']), values)).toBeCloseTo(0.3, 10);
  });
});
