import { describe, expect, it } from 'vitest';
import { CLIENT_OPTION_LABEL_FIELD, clientOptionLabel } from './clientOptions';

// Every client picker in the app routes its label through this one function (§4.15),
// so a regression here silently switches dropdowns back to 200-char legal names.

describe('clientOptionLabel', () => {
  it('prefers the short code over the legal name', () => {
    expect(clientOptionLabel({ id: 7, short_name: 'ABC', company_name: 'Alpha Beta Congo SARL' })).toBe('ABC');
  });

  it('falls back to the company name when the code is missing or blank', () => {
    expect(clientOptionLabel({ id: 7, company_name: 'Alpha Beta Congo SARL' })).toBe('Alpha Beta Congo SARL');
    expect(clientOptionLabel({ id: 7, short_name: '   ', company_name: 'Alpha' })).toBe('Alpha');
    expect(clientOptionLabel({ id: 7, short_name: null, company_name: 'Alpha' })).toBe('Alpha');
  });

  it('never renders a blank option — an unnamed row shows its id', () => {
    expect(clientOptionLabel({ id: 7 })).toBe('#7');
    expect(clientOptionLabel({ id: 7, short_name: null, company_name: null })).toBe('#7');
  });

  it('trims surrounding whitespace so options align in the list', () => {
    expect(clientOptionLabel({ id: 7, short_name: ' ABC ' })).toBe('ABC');
  });

  it('names the column the metadata page runtime must be configured with', () => {
    expect(CLIENT_OPTION_LABEL_FIELD).toBe('short_name');
  });
});
