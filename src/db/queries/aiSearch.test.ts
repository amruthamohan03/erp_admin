import { describe, expect, it } from 'vitest';
import { normaliseReference } from './aiSearch';

describe('normaliseReference', () => {
  it('ignores case, separators and leading zeros, as people quote references', () => {
    const want = normaliseReference('NMI-IDCOR26-0001');
    expect(normaliseReference('nmi idcor26 1')).toBe(want);
    expect(normaliseReference('NMI-IDCOR-26-001')).toBe(want);
    expect(normaliseReference('ACSELC-IDDIA-26-1')).toBe(normaliseReference('ACSELC-IDDIA26-0001'));
  });

  it('keeps zeros that are a number’s value, not its padding', () => {
    expect(normaliseReference('LIC-10')).toBe('LIC10');
    expect(normaliseReference('LIC-100')).toBe('LIC100');
    expect(normaliseReference('2026-0100')).toBe('2026100');
  });
});
