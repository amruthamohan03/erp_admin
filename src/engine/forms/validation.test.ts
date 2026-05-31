import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { buildFieldZodSchema, buildFormZodSchema } from './validation';
import type { FormFieldRow } from '@/db/schema';

// Test fixture — a minimum-viable FormFieldRow. Defaults to `text` required.
function field(overrides: Partial<FormFieldRow> = {}): FormFieldRow {
  return {
    id: 1,
    formId: 1,
    fieldKey: 'sample',
    label: 'Sample',
    fieldType: 'text',
    required: true,
    defaultValue: null,
    helpText: null,
    validationJson: null,
    optionsJson: null,
    displayOrder: 0,
    display: 'Y',
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('buildFieldZodSchema — field_type baselines', () => {
  it('text required: accepts strings, rejects undefined', () => {
    const s = buildFieldZodSchema(field());
    expect(() => s.parse('hello')).not.toThrow();
    expect(() => s.parse(undefined)).toThrow(ZodError);
    expect(() => s.parse(42)).toThrow(ZodError);
  });

  it('text optional: accepts undefined and null', () => {
    const s = buildFieldZodSchema(field({ required: false }));
    expect(s.parse(undefined)).toBeUndefined();
    expect(s.parse(null)).toBeNull();
    expect(s.parse('ok')).toBe('ok');
  });

  it('email rejects non-email strings', () => {
    const s = buildFieldZodSchema(field({ fieldType: 'email' }));
    expect(() => s.parse('not-an-email')).toThrow(ZodError);
    expect(s.parse('a@b.co')).toBe('a@b.co');
  });

  it('number rejects strings', () => {
    const s = buildFieldZodSchema(field({ fieldType: 'number' }));
    expect(() => s.parse('5')).toThrow(ZodError);
    expect(s.parse(5)).toBe(5);
  });

  it('checkbox accepts booleans only', () => {
    const s = buildFieldZodSchema(field({ fieldType: 'checkbox' }));
    expect(s.parse(true)).toBe(true);
    expect(s.parse(false)).toBe(false);
    expect(() => s.parse('true')).toThrow(ZodError);
  });

  it('unsupported field_type throws at build time', () => {
    expect(() =>
      buildFieldZodSchema(field({ fieldType: 'unknown_type' })),
    ).toThrow(/unsupported field_type/i);
  });
});

describe('buildFieldZodSchema — validation_json tokens', () => {
  it('min / max apply to text length', () => {
    const s = buildFieldZodSchema(
      field({ validationJson: { min: 3, max: 5 } }),
    );
    expect(() => s.parse('ab')).toThrow(ZodError);
    expect(() => s.parse('abcdef')).toThrow(ZodError);
    expect(s.parse('abcd')).toBe('abcd');
  });

  it('min / max apply to number range', () => {
    const s = buildFieldZodSchema(
      field({ fieldType: 'number', validationJson: { min: 0, max: 100 } }),
    );
    expect(() => s.parse(-1)).toThrow(ZodError);
    expect(() => s.parse(101)).toThrow(ZodError);
    expect(s.parse(50)).toBe(50);
  });

  it('pattern enforces a regex for text', () => {
    const s = buildFieldZodSchema(
      field({ validationJson: { pattern: '^[A-Z]{2,3}$' } }),
    );
    expect(s.parse('IB')).toBe('IB');
    expect(s.parse('EXP')).toBe('EXP');
    expect(() => s.parse('ib')).toThrow(ZodError);
    expect(() => s.parse('TOOLONG')).toThrow(ZodError);
  });

  it('validation_json.required overrides field.required', () => {
    const s = buildFieldZodSchema(
      field({ required: false, validationJson: { required: true } }),
    );
    expect(() => s.parse(undefined)).toThrow(ZodError);
  });

  it('select with enum accepts only listed values', () => {
    const s = buildFieldZodSchema(
      field({
        fieldType: 'select',
        validationJson: { enum: ['IB', 'Export'] },
      }),
    );
    expect(s.parse('IB')).toBe('IB');
    expect(s.parse('Export')).toBe('Export');
    expect(() => s.parse('Other')).toThrow(ZodError);
  });

  it('select without enum is unrestricted (caller validates downstream)', () => {
    const s = buildFieldZodSchema(field({ fieldType: 'select' }));
    expect(s.parse('anything')).toBe('anything');
    expect(s.parse(42)).toBe(42);
  });

  it('malformed validation_json is rejected at build time', () => {
    expect(() =>
      buildFieldZodSchema(field({ validationJson: { min: 'three' } })),
    ).toThrow(ZodError);
  });
});

describe('buildFormZodSchema', () => {
  it('composes a ZodObject over all field keys', () => {
    const schema = buildFormZodSchema([
      field({ fieldKey: 'name' }),
      field({ fieldKey: 'amount', fieldType: 'number', required: false }),
    ]);
    expect(() =>
      schema.parse({ name: 'License A', amount: 1000 }),
    ).not.toThrow();
    expect(() => schema.parse({ amount: 1000 })).toThrow(ZodError); // name required
    expect(() => schema.parse({ name: 'OK' })).not.toThrow(); // amount optional
  });

  it('returns a parsed object with all defined keys present', () => {
    const schema = buildFormZodSchema([
      field({ fieldKey: 'name' }),
      field({ fieldKey: 'kind', fieldType: 'select', validationJson: { enum: ['A', 'B'] } }),
    ]);
    const parsed = schema.parse({ name: 'X', kind: 'A' });
    expect(parsed).toEqual({ name: 'X', kind: 'A' });
  });
});
