import { describe, expect, it } from 'vitest';
import {
  hexToHsl,
  hslToToken,
  readableOn,
  relativeLuminance,
  shiftLightness,
} from './color';
import { BRANDING_DEFAULTS, brandingCssVars, renderFooterText } from './branding';

// Every surface in the app now reads its colour from these derivations, so a
// regression here recolours the whole product.

function tokenOf(css: string, name: string, scope: 'light' | 'dark'): string {
  const block = scope === 'light' ? /:root:root\{([^}]*)\}/ : /html\.dark:root\{([^}]*)\}/;
  const body = block.exec(css)?.[1] ?? '';
  return new RegExp(`--${name}:([^;]*);`).exec(body)?.[1] ?? '';
}

describe('hexToHsl', () => {
  it('round-trips the known brand indigo', () => {
    expect(hslToToken(hexToHsl('#4f46e5')!)).toBe('243 75% 59%');
  });

  it('handles greys, where hue is undefined', () => {
    expect(hexToHsl('#808080')).toEqual({ h: 0, s: 0, l: expect.closeTo(50.2, 1) });
  });

  it('accepts a missing hash but rejects shorthand and garbage', () => {
    expect(hexToHsl('4f46e5')).not.toBeNull();
    expect(hexToHsl('#fff')).toBeNull();
    expect(hexToHsl('rebeccapurple')).toBeNull();
    expect(hexToHsl('')).toBeNull();
  });
});

describe('shiftLightness', () => {
  it('clamps rather than wrapping past the ends of the range', () => {
    expect(shiftLightness({ h: 243, s: 75, l: 95 }, 20).l).toBe(100);
    expect(shiftLightness({ h: 243, s: 75, l: 5 }, -20).l).toBe(0);
  });
});

describe('readableOn', () => {
  it('picks a light foreground on a dark brand and a dark one on a pale brand', () => {
    expect(readableOn(hexToHsl('#4f46e5')!).l).toBeGreaterThan(90);
    expect(readableOn(hexToHsl('#fde68a')!).l).toBeLessThan(20);
  });

  it('keeps the pairing above the 4.5:1 body-text ratio', () => {
    for (const hex of ['#4f46e5', '#7c3aed', '#fde68a', '#151a30', '#ffffff']) {
      const bg = hexToHsl(hex)!;
      const fg = readableOn(bg);
      const [lo, hi] = [relativeLuminance(bg), relativeLuminance(fg)].sort((a, b) => a - b);
      expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThan(4.5);
    }
  });
});

describe('brandingCssVars', () => {
  const css = brandingCssVars(BRANDING_DEFAULTS);

  it('emits both scopes with over-specific selectors so stylesheet order cannot win', () => {
    expect(css).toContain(':root:root{');
    expect(css).toContain('html.dark:root{');
  });

  it('maps the configured brand onto the primary token', () => {
    expect(tokenOf(css, 'primary', 'light')).toBe('243 75% 59%');
  });

  it('lifts the brand for dark surfaces instead of reusing the light value', () => {
    const light = tokenOf(css, 'primary', 'light');
    const dark = tokenOf(css, 'primary', 'dark');
    expect(dark).not.toBe(light);
    expect(Number(/(\d+)%$/.exec(dark)![1])).toBeGreaterThan(
      Number(/(\d+)%$/.exec(light)![1]),
    );
  });

  it('darkens the header gradient in dark mode, where a bright bar reads as glare', () => {
    const lightFrom = Number(/(\d+)%$/.exec(tokenOf(css, 'brand-from', 'light'))![1]);
    const darkFrom = Number(/(\d+)%$/.exec(tokenOf(css, 'brand-from', 'dark'))![1]);
    expect(darkFrom).toBeLessThan(lightFrom);
  });

  it('emits the full numeric ramp the existing pages depend on', () => {
    for (const step of [50, 100, 500, 600, 700, 900]) {
      expect(tokenOf(css, `primary-${step}`, 'light')).not.toBe('');
      expect(tokenOf(css, `primary-${step}`, 'dark')).not.toBe('');
    }
  });

  it('keeps the gradient visible when primary and accent are the same colour', () => {
    const flat = brandingCssVars({
      ...BRANDING_DEFAULTS,
      primary_color: '#2563eb',
      accent_color: '#2563eb',
    });
    expect(tokenOf(flat, 'brand-from', 'light')).not.toBe(tokenOf(flat, 'brand-to', 'light'));
  });

  it('caps an over-bright brand so white text on it stays legible', () => {
    const pale = brandingCssVars({ ...BRANDING_DEFAULTS, primary_color: '#e9d5ff' });
    expect(Number(/(\d+)%$/.exec(tokenOf(pale, 'primary', 'light'))![1])).toBeLessThanOrEqual(62);
  });

  it('falls back to the default brand rather than emitting an invalid token', () => {
    const broken = brandingCssVars({ ...BRANDING_DEFAULTS, primary_color: 'not-a-colour' });
    expect(tokenOf(broken, 'primary', 'light')).toBe('243 75% 59%');
  });

  it('adapts the sidebar accent to a light sidebar background', () => {
    const lightBar = brandingCssVars({ ...BRANDING_DEFAULTS, sidebar_bg: '#ffffff' });
    expect(tokenOf(lightBar, 'sidebar-accent', 'light')).toBe('243 75% 59%');
  });
});

describe('renderFooterText', () => {
  it('substitutes every {year} placeholder', () => {
    expect(renderFooterText('© {year} · {year}', 2026)).toBe('© 2026 · 2026');
  });

  it('passes null through so the caller can fall back', () => {
    expect(renderFooterText(null, 2026)).toBeNull();
  });
});
