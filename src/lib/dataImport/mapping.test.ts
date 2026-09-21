import { describe, it, expect } from 'vitest';
import { missingRequired, normaliseHeading, suggestMapping, type TargetField } from './mapping';

const f = (name: string, label: string, required = false): TargetField => ({ name, label, type: 'text', required });

const FIELDS: TargetField[] = [
  f('company_name', 'Company Name', true),
  f('short_name', 'Short Name', true),
  f('email', 'Email'),
  f('mobile', 'Mobile'),
];

describe('normaliseHeading', () => {
  it('reduces a heading to what it means', () => {
    expect(normaliseHeading('Client Name')).toBe('CLIENT NAME');
    expect(normaliseHeading('client_name')).toBe('CLIENT NAME');
    expect(normaliseHeading('  COMPANY  NAME (legal) ')).toBe('COMPANY NAME');
  });
});

describe('suggestMapping', () => {
  it('matches a heading to the field it names, however it is written', () => {
    const m = suggestMapping(['Company Name', 'short_name', 'E-Mail'], FIELDS);
    expect(m).toMatchObject({ 'Company Name': 'company_name', short_name: 'short_name', 'E-Mail': 'email' });
  });

  it('leaves a heading it cannot place unmapped rather than guessing', () => {
    expect(suggestMapping(['Rocket Fuel'], FIELDS)['Rocket Fuel']).toBeNull();
  });

  it('gives a field to its best heading only — the second is left for the operator', () => {
    const m = suggestMapping(['Company Name', 'Company Name Old'], FIELDS);
    expect(m['Company Name']).toBe('company_name');
    expect(m['Company Name Old']).toBeNull();
  });

  it('a taught alias beats every similarity guess', () => {
    const m = suggestMapping(['Nom du client'], FIELDS, { aliases: { 'NOM DU CLIENT': 'company_name' } });
    expect(m['Nom du client']).toBe('company_name');
  });

  it('ignores an alias for a field this target does not have', () => {
    const m = suggestMapping(['Ghost'], FIELDS, { aliases: { GHOST: 'no_such_field' } });
    expect(m['Ghost']).toBeNull();
  });
});

describe('missingRequired', () => {
  it('names the required fields nothing feeds', () => {
    const m = suggestMapping(['Company Name'], FIELDS);
    expect(missingRequired(m, FIELDS).map((x) => x.name)).toEqual(['short_name']);
  });
});
