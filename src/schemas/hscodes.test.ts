import { describe, it, expect } from 'vitest';
import { hscodeCreateSchema, hscodeUpdateSchema } from './hscodes';

/**
 * The rate validator, which used to accept anything.
 *
 * `z.union([z.string(), z.number()])` with no further check meant every string
 * satisfied it, so `"abc"` passed the boundary and reached Postgres as a numeric
 * literal — SQLSTATE 22P02, surfaced to the operator as a server error rather
 * than as "that is not a percentage". The form could not produce it (its input
 * is type="number"), but the endpoint is public and §4.7 puts the guarantee at
 * the boundary.
 */
describe('hscodeCreateSchema rates', () => {
  const base = { hscode_number: '8517.12.00' };

  it('accepts a plain percentage', () => {
    const out = hscodeCreateSchema.parse({ ...base, hscode_ddi: '10.00' });
    expect(out.hscode_ddi).toBe('10.00');
  });

  it('accepts a number and stores it as a string', () => {
    // numeric(5,2) is read and written as a string by the driver; coercing here
    // keeps JS float precision out of the rate.
    expect(hscodeCreateSchema.parse({ ...base, hscode_ica: 7.5 }).hscode_ica).toBe('7.5');
  });

  it('REJECTS a non-numeric string — the bug this guards', () => {
    expect(() => hscodeCreateSchema.parse({ ...base, hscode_ddi: 'abc' })).toThrow();
  });

  it('rejects a value the column cannot hold', () => {
    // numeric(5,2) tops out at 999.99; 1000 would be 22003 from Postgres.
    expect(() => hscodeCreateSchema.parse({ ...base, hscode_dci: '1000' })).toThrow();
  });

  it('rejects more than two decimal places', () => {
    expect(() => hscodeCreateSchema.parse({ ...base, hscode_tpi: '10.005' })).toThrow();
  });

  it('rejects a negative rate', () => {
    expect(() => hscodeCreateSchema.parse({ ...base, hscode_dcl: '-1' })).toThrow();
  });

  it('allows a rate above 100, because excise duties genuinely go there', () => {
    // Bounded by the COLUMN, not by 100 — refusing a rate the tariff actually
    // sets would be worse than allowing a typo.
    expect(hscodeCreateSchema.parse({ ...base, hscode_dci: '150.00' }).hscode_dci).toBe('150.00');
  });

  it('treats blank and missing alike', () => {
    expect(hscodeCreateSchema.parse({ ...base, hscode_ddi: '' }).hscode_ddi).toBeUndefined();
    expect(hscodeCreateSchema.parse(base).hscode_ddi).toBeUndefined();
  });

  it('trims a padded value rather than failing on the space', () => {
    expect(hscodeCreateSchema.parse({ ...base, hscode_ddi: ' 10.00 ' }).hscode_ddi).toBe('10.00');
  });
});

describe('green certificate flag', () => {
  it('defaults to not required on create', () => {
    expect(hscodeCreateSchema.parse({ hscode_number: '0101.21.00' }).requires_green_certificate)
      .toBe(false);
  });

  it('is carried through when set', () => {
    expect(
      hscodeCreateSchema.parse({ hscode_number: '0101.21.00', requires_green_certificate: true })
        .requires_green_certificate,
    ).toBe(true);
  });

  it('is optional on update, so a patch that omits it leaves it alone', () => {
    expect(hscodeUpdateSchema.parse({ hscode_ddi: '5.00' }).requires_green_certificate)
      .toBeUndefined();
  });

  it('rejects a non-boolean rather than coercing it', () => {
    // 'true' as a string would have been stored as boolean true by Postgres,
    // which is the kind of quiet coercion that makes an audit diff lie.
    expect(() =>
      hscodeCreateSchema.parse({ hscode_number: '1', requires_green_certificate: 'yes' }),
    ).toThrow();
  });
});
