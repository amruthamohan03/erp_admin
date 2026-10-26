import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  checkEmail,
  checkFieldValue,
  checkPhone,
  dateWarnings,
  emailField,
  numberWarnings,
  phoneDigits,
  phoneField,
  repeatedContactWarnings,
} from './fields';

// §4.40 — these pin the SENTENCES, because the sentence is the feature: an
// operator reading "Email is missing the "@"" fixes it; one reading "Invalid
// input" does not.

describe('checkEmail', () => {
  it('accepts a normal address and lower-cases only the domain', () => {
    expect(checkEmail('  Jean.Paul@Company.CD ')).toEqual({ value: 'Jean.Paul@company.cd', warnings: [] });
  });

  it.each([
    ['jean.company.cd', 'Email is missing the "@" — it should look like name@company.com.'],
    ['jean@@company.cd', 'Email has more than one "@" — enter a single address.'],
    ['@company.cd', 'Email is missing the part before the "@".'],
    ['jean@', 'Email is missing the domain after the "@" (e.g. company.com).'],
    ['jean@company', 'Email needs a full domain after the "@", with a dot — e.g. jean@company.com.'],
    ['jean paul@company.cd', 'Email cannot contain spaces.'],
    ['jean..paul@company.cd', 'Email has characters that are not allowed before the "@".'],
    ['jean@company.c0m', 'Email ends in ".c0m", which is not a valid domain ending.'],
  ])('rejects %s with a sentence naming the problem', (input, message) => {
    expect(checkEmail(input).error).toBe(message);
  });

  it('names the field it is checking', () => {
    expect(checkEmail('nope', 'Payment Contact Email').error).toMatch(/^Payment Contact Email /u);
  });

  it('warns — never blocks — on a misspelt provider', () => {
    const r = checkEmail('jean@gmial.com');
    expect(r.error).toBeUndefined();
    expect(r.value).toBe('jean@gmial.com');
    expect(r.warnings).toEqual(['Email: did you mean jean@gmail.com?']);
  });

  it('states the length limit and the actual length', () => {
    expect(checkEmail(`${'a'.repeat(95)}@x.com`, 'Email', 100).error).toBe(
      'Email must be 100 characters or fewer — this one is 101.',
    );
  });
});

describe('checkPhone', () => {
  it.each([
    ['+243 812 345 678', '+243812345678'],
    ['+243-81-234-5678', '+243812345678'],
    ['(+243) 812.345.678', '+243812345678'],
    ['00243 812 345 678', '+243812345678'],
    ['+27 11 555 0100', '+27115550100'],
  ])('accepts %s as %s', (input, stored) => {
    expect(checkPhone(input)).toEqual({ value: stored, warnings: [] });
  });

  it('accepts a number with no country code but warns and does not guess one', () => {
    const r = checkPhone('0812 345 678');
    expect(r.error).toBeUndefined();
    expect(r.value).toBe('0812345678');
    expect(r.warnings[0]).toBe(
      'Phone has no country code — add it (e.g. +243 for DRC) so the number can be dialled from abroad.',
    );
  });

  it.each([
    ['+243 81A 345', 'Phone can only contain digits, spaces, dashes, brackets and a leading + — "+243 81A 345" has other characters.'],
    ['+243 12', 'Phone is too short — 5 digits, a phone number has at least 8.'],
    ['+243 812 345 678 901 23', 'Phone is too long — 17 digits, an international number has at most 15.'],
    ['243+812345678', 'Phone can have a single + only, at the start (e.g. +243 812 345 678).'],
    ['+0243 812 345 678', 'Phone: a country code never starts with 0 — remove the 0 after the +.'],
  ])('rejects %s', (input, message) => {
    expect(checkPhone(input).error).toBe(message);
  });

  it('compares numbers by digits for duplicate detection', () => {
    expect(phoneDigits('+243 812-345-678')).toBe(phoneDigits('00243812345678'));
  });
});

describe('warnings for unusual values', () => {
  const today = new Date('2026-10-26T00:00:00Z');
  it('flags a year that looks mistyped, in either direction', () => {
    expect(dateWarnings('1926-10-01', 'Expiry Date', today)).toEqual([
      'Expiry Date is in 1926, more than 30 years ago — check the year.',
    ]);
    expect(dateWarnings('2062-10-01', 'Expiry Date', today)).toEqual([
      'Expiry Date is in 2062, more than 20 years ahead — check the year.',
    ]);
    expect(dateWarnings('2027-01-15', 'Expiry Date', today)).toEqual([]);
  });

  it('flags zero and negative numbers', () => {
    expect(numberWarnings('0', 'Weight')).toEqual(['Weight is 0 — leave it blank if the value is not known yet.']);
    expect(numberWarnings(-5, 'FOB')).toEqual(['FOB is negative (-5) — check the sign.']);
    expect(numberWarnings('12,500.5', 'FOB')).toEqual([]);
  });
});

describe('checkFieldValue', () => {
  it('enforces a configured pattern with the configured sentence', () => {
    const r = checkFieldValue('text', 'AB-12', 'NIF Number', { pattern: '[A-Z]\\d{7}[A-Z]', patternMessage: 'use the format A1234567B.' });
    expect(r.error).toBe('NIF Number: use the format A1234567B.');
  });

  it('ignores a malformed configured pattern rather than blocking every save', () => {
    expect(checkFieldValue('text', 'x', 'Code', { pattern: '[' }).error).toBeUndefined();
  });

  it('routes email and tel to their own checks', () => {
    expect(checkFieldValue('email', 'bad', 'Email').error).toContain('"@"');
    expect(checkFieldValue('tel', '+243 812 345 678', 'Phone').value).toBe('+243812345678');
  });
});

describe('repeatedContactWarnings', () => {
  it('warns on the second copy of the same number, compared by digits', () => {
    expect(
      repeatedContactWarnings([
        { name: 'phone', label: 'Phone', type: 'tel', value: '+243 812 345 678' },
        { name: 'phone_secondary', label: 'Phone (Secondary)', type: 'tel', value: '00243812345678' },
      ]),
    ).toEqual({ phone_secondary: 'Phone (Secondary) is the same as Phone — was that intended?' });
  });
});

describe('emailField / phoneField (Zod)', () => {
  const schema = z.object({ email: emailField('Email'), mobile: phoneField('Mobile', { optional: true }) });

  it('normalises on the way in', () => {
    expect(schema.parse({ email: 'A@B.CD', mobile: '+243 812 345 678' })).toEqual({ email: 'A@b.cd', mobile: '+243812345678' });
  });

  it('reports the same sentence the page runtime uses', () => {
    const r = schema.safeParse({ email: 'nope', mobile: '12' });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.map((i) => i.message)).toEqual([
      'Email is missing the "@" — it should look like name@company.com.',
      'Mobile is too short — 2 digits, a phone number has at least 8.',
    ]);
  });

  it('treats an empty optional value as none', () => {
    expect(schema.parse({ email: 'a@b.cd', mobile: '' }).mobile).toBeNull();
  });
});

describe('emailField / phoneField on an update schema', () => {
  // The bug this pins: a .partial() update that omits the email must NOT
  // overwrite the stored one with null.
  const update = z.object({ email: emailField('Email', { optional: true }), phone: phoneField('Phone', { optional: true }) }).partial();

  it('leaves a field that was not sent as undefined', () => {
    expect(update.parse({})).toEqual({ email: undefined, phone: undefined });
  });

  it('stores an explicitly cleared field as null', () => {
    expect(update.parse({ email: '', phone: null })).toEqual({ email: null, phone: null });
  });
});
