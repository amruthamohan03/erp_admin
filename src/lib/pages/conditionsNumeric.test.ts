import { describe, it, expect } from 'vitest';
import { checkNumericBounds } from './conditions';

// §4.1/§4.23 — numeric bounds come from the field's own props, and the message
// names the field and the bound.

describe('checkNumericBounds', () => {
  const MIN = { min: 0.01, step: '0.01' };

  // The case this exists for: a payment request for zero passed `required`
  // (0 IS a value) and passed `min: 0`, so it could be raised and approved.
  it('rejects zero when the field has a positive minimum', () => {
    expect(checkNumericBounds(MIN, 'Amount', 0)).toBe('Amount must be at least 0.01.');
  });

  it('rejects zero submitted as a string, as a form sends it', () => {
    expect(checkNumericBounds(MIN, 'Amount', '0')).toBe('Amount must be at least 0.01.');
    expect(checkNumericBounds(MIN, 'Amount', '0.00')).toBe('Amount must be at least 0.01.');
  });

  it('accepts the smallest storable amount', () => {
    expect(checkNumericBounds(MIN, 'Amount', 0.01)).toBeNull();
    expect(checkNumericBounds(MIN, 'Amount', '1250.75')).toBeNull();
  });

  it('rejects a negative amount', () => {
    expect(checkNumericBounds(MIN, 'Amount', -5)).toBe('Amount must be at least 0.01.');
  });

  it('enforces a maximum too, naming the bound', () => {
    expect(checkNumericBounds({ max: 100 }, 'Percentage', 101)).toBe('Percentage must be 100 or less.');
    expect(checkNumericBounds({ max: 100 }, 'Percentage', 100)).toBeNull();
  });

  // An empty field is `required`'s business, not the bound's — otherwise an
  // optional number would be unfillable.
  it('says nothing about an empty value', () => {
    expect(checkNumericBounds(MIN, 'Amount', null)).toBeNull();
    expect(checkNumericBounds(MIN, 'Amount', undefined)).toBeNull();
    expect(checkNumericBounds(MIN, 'Amount', '')).toBeNull();
  });

  // Saying "must be at least 0.01" about the text "abc" explains nothing; the
  // field type is what rejects that.
  it('says nothing about a value that is not a number', () => {
    expect(checkNumericBounds(MIN, 'Amount', 'abc')).toBeNull();
  });

  it('is inert for a field with no bounds configured', () => {
    expect(checkNumericBounds({ colSpan: '5-per-row' }, 'Amount', 0)).toBeNull();
    expect(checkNumericBounds(null, 'Amount', 0)).toBeNull();
    expect(checkNumericBounds(undefined, 'Amount', 0)).toBeNull();
  });

  // A props bag is operator-editable config, so a nonsense bound must not
  // start rejecting everything.
  it('ignores a bound that is not a number', () => {
    expect(checkNumericBounds({ min: 'lots' }, 'Amount', 0)).toBeNull();
    expect(checkNumericBounds({ min: '' }, 'Amount', 0)).toBeNull();
  });

  it('reads a bound supplied as a numeric string', () => {
    expect(checkNumericBounds({ min: '0.01' }, 'Amount', 0)).toBe('Amount must be at least 0.01.');
  });
});

// §4.23 — a configured sentence wins, so a field the operator cannot type into
// can say where the number actually comes from.
describe('a configured bound message', () => {
  const AMOUNT = {
    min: 0.01,
    minMessage: 'Amount must be more than zero. It is the total of the Tracking References below — enter an amount on each row.',
  };

  it('replaces the generated sentence', () => {
    expect(checkNumericBounds(AMOUNT, 'Amount', 0)).toBe(AMOUNT.minMessage);
  });

  it('still says nothing when the value is within bounds', () => {
    expect(checkNumericBounds(AMOUNT, 'Amount', 10)).toBeNull();
  });

  it('falls back to the generated sentence when the message is blank', () => {
    expect(checkNumericBounds({ min: 0.01, minMessage: '   ' }, 'Amount', 0))
      .toBe('Amount must be at least 0.01.');
  });

  it('keeps min and max messages apart', () => {
    const both = { min: 1, max: 5, minMessage: 'Too small', maxMessage: 'Too big' };
    expect(checkNumericBounds(both, 'Qty', 0)).toBe('Too small');
    expect(checkNumericBounds(both, 'Qty', 9)).toBe('Too big');
  });
});
