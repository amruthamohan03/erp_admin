import { describe, expect, it } from 'vitest';
import {
  greenCertificateFor,
  matchingPrefix,
  normaliseHsCode,
} from './greenCertificate';

describe('normaliseHsCode', () => {
  it('keeps only digits, so punctuation cannot change the answer', () => {
    expect(normaliseHsCode('0101.21.00')).toBe('01012100');
    expect(normaliseHsCode('0101 21 00')).toBe('01012100');
    expect(normaliseHsCode('01012100')).toBe('01012100');
  });

  it('treats a missing code as empty rather than throwing', () => {
    expect(normaliseHsCode(null)).toBe('');
    expect(normaliseHsCode(undefined)).toBe('');
  });
});

describe('matchingPrefix', () => {
  it('matches a prefix written without the dots the code carries', () => {
    expect(matchingPrefix('0301.11.00', ['0301'])).toBe('0301');
  });

  it('matches a prefix written WITH dots against a code written without', () => {
    expect(matchingPrefix('03011100', ['03.01'])).toBe('03.01');
  });

  it('returns the prefix that matched, so the UI can say which rule applied', () => {
    expect(matchingPrefix('4403.11.00', ['0301', '4403', '8501'])).toBe('4403');
  });

  it('does not match a code that merely CONTAINS the prefix', () => {
    // 4403 appears inside 1244.03, which is a different tariff line entirely.
    expect(matchingPrefix('1244.03', ['4403'])).toBeNull();
  });

  it('matches a code equal to the prefix', () => {
    expect(matchingPrefix('0301', ['0301'])).toBe('0301');
  });

  it('does not match a code SHORTER than the prefix', () => {
    expect(matchingPrefix('03', ['0301'])).toBeNull();
  });

  it('ignores a blank prefix instead of matching everything', () => {
    // A half-typed master row must not put the whole tariff under the rule.
    expect(matchingPrefix('0101.21', ['', '   ', '..'])).toBeNull();
  });

  it('has nothing to match when the code has no digits', () => {
    expect(matchingPrefix('', ['0301'])).toBeNull();
    expect(matchingPrefix(null, ['0301'])).toBeNull();
  });
});

describe('greenCertificateFor', () => {
  const prefixes = ['0301', '4403'];

  it('requires the certificate when a prefix matches', () => {
    expect(greenCertificateFor('0301.11.00', null, prefixes)).toEqual({
      required: true,
      source: 'prefix',
      prefix: '0301',
    });
  });

  it('leaves a code alone when no prefix matches', () => {
    expect(greenCertificateFor('8501.10.00', null, prefixes)).toEqual({
      required: false,
      source: 'none',
      prefix: null,
    });
  });

  it('lets a code opt IN where no prefix covers it', () => {
    expect(greenCertificateFor('8501.10.00', true, prefixes)).toEqual({
      required: true,
      source: 'override',
      prefix: null,
    });
  });

  it('lets a code opt OUT of a prefix that does cover it', () => {
    // The whole point of the tri-state: an exemption must survive a rule that
    // correctly covers ninety-nine other lines.
    expect(greenCertificateFor('0301.11.00', false, prefixes)).toEqual({
      required: false,
      source: 'override',
      prefix: null,
    });
  });

  it('treats undefined the same as null — no decision has been recorded', () => {
    expect(greenCertificateFor('0301.11.00', undefined, prefixes).source).toBe('prefix');
  });

  it('requires nothing when no prefixes are configured', () => {
    expect(greenCertificateFor('0301.11.00', null, []).required).toBe(false);
  });
});
