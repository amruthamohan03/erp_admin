import {
  forDarkSurface,
  hexToHsl,
  hslToToken,
  readableOn,
  relativeLuminance,
  shiftLightness,
  withLightness,
  type Hsl,
} from './color';

// App branding, and the bridge from the four operator-editable colours in
// `application_settings_master_t` to the CSS custom properties every surface reads.
//
// The palette is master-driven (§4.1): no component names a brand colour. Changing
// the look of the whole app is a row edit on /settings/application, not a code change.
// This module is the single place that decides how those four hexes expand into the
// full token set — light shades, dark-theme shades, gradients, and legible
// foregrounds are all derived, so an operator never has to pick eight colours that
// happen to work together.

export interface Branding {
  project_name: string;
  app_title: string;
  tagline: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  accent_color: string;
  sidebar_bg: string;
  sidebar_fg: string;
  footer_text: string | null;
}

/**
 * Fallback identity. Used when the singleton row is missing or the database is
 * unreachable, so the login page still renders on-brand during an outage. Kept in
 * sync with the column defaults in `src/db/schema/applicationSettings.ts` and the
 * seed — change all three together, via a migration (§7.2).
 */
export const BRANDING_DEFAULTS: Branding = {
  project_name: 'ERP Admin',
  app_title: 'ERP Admin',
  tagline: 'Management Console',
  logo_url: null,
  favicon_url: null,
  primary_color: '#4f46e5',
  accent_color: '#7c3aed',
  sidebar_bg: '#151a30',
  sidebar_fg: '#e2e8f0',
  footer_text: '© {year} ERP Admin · All rights reserved.',
};

function parse(hex: string, fallback: string): Hsl {
  return hexToHsl(hex) ?? hexToHsl(fallback) ?? { h: 244, s: 76, l: 59 };
}

function isDark(hsl: Hsl): boolean {
  return relativeLuminance(hsl) < 0.45;
}

/** `--token: H S% L%;` — one declaration line. */
function decl(name: string, hsl: Hsl): string {
  return `--${name}:${hslToToken(hsl)};`;
}

/**
 * The numeric `primary-*` ramp consumed by ~190 existing utility classes across the
 * master pages (`text-primary-600`, `bg-primary-50`, …). Those steps get used as both
 * text colour and fill, so the dark ramp is tuned as a compromise that stays legible
 * either way rather than being a straight inversion of the light one.
 */
function primaryRamp(base: Hsl, scheme: 'light' | 'dark'): string {
  const steps: Array<[number, Hsl]> =
    scheme === 'light'
      ? [
          [50, { h: base.h, s: base.s, l: 96 }],
          [100, { h: base.h, s: base.s, l: 92 }],
          [500, { h: base.h, s: base.s, l: 62 }],
          [600, { h: base.h, s: base.s, l: 55 }],
          [700, { h: base.h, s: base.s, l: 46 }],
          [900, { h: base.h, s: base.s, l: 28 }],
        ]
      : [
          [50, { h: base.h, s: Math.min(base.s, 35), l: 20 }],
          [100, { h: base.h, s: Math.min(base.s, 38), l: 26 }],
          [500, { h: base.h, s: Math.min(base.s, 80), l: 70 }],
          [600, { h: base.h, s: Math.min(base.s, 80), l: 66 }],
          [700, { h: base.h, s: Math.min(base.s, 80), l: 60 }],
          [900, { h: base.h, s: Math.min(base.s, 80), l: 82 }],
        ];

  return steps.map(([step, hsl]) => decl(`primary-${step}`, hsl)).join('');
}

/**
 * Build the `<style>` body that overrides the base tokens with the configured brand.
 *
 * Selectors are deliberately over-specific (`:root:root`, `html.dark:root`). The base
 * tokens live in globals.css, which Next may emit either before or after this inline
 * style; winning on specificity makes the outcome independent of that ordering.
 */
export function brandingCssVars(branding: Branding): string {
  const primaryRaw = parse(branding.primary_color, BRANDING_DEFAULTS.primary_color);
  const accentRaw = parse(branding.accent_color, BRANDING_DEFAULTS.accent_color);
  const sidebarBg = parse(branding.sidebar_bg, BRANDING_DEFAULTS.sidebar_bg);
  const sidebarFg = parse(branding.sidebar_fg, BRANDING_DEFAULTS.sidebar_fg);

  // On a white canvas a brand lighter than ~62% can't carry white text, so pin the
  // ceiling rather than trusting whatever the operator picked.
  const primary = withLightness(primaryRaw, Math.min(primaryRaw.l, 62));
  const accent = withLightness(accentRaw, Math.min(accentRaw.l, 62));

  // Header/footer gradient. Two identical brand colours would render as a flat bar,
  // so fall back to a same-hue sweep when primary and accent are the same colour.
  const gradientTo =
    Math.abs(accent.h - primary.h) < 6 && Math.abs(accent.l - primary.l) < 6
      ? shiftLightness({ ...primary, h: (primary.h + 26) % 360 }, -8)
      : accent;

  const sidebarDark = isDark(sidebarBg);
  // The active-item pill has to separate from the sidebar itself, so lift the brand
  // on a dark sidebar and keep it as-is on a light one.
  const sidebarAccent = sidebarDark ? forDarkSurface(primary) : primary;
  const sidebarBorder = shiftLightness(sidebarBg, sidebarDark ? 9 : -9);

  const light = [
    decl('primary', primary),
    decl('primary-foreground', readableOn(primary)),
    decl('ring', primary),
    decl('brand', primary),
    decl('brand-foreground', readableOn(primary)),
    decl('brand-accent', accent),
    decl('brand-accent-foreground', readableOn(accent)),
    decl('brand-from', primary),
    decl('brand-to', gradientTo),
    decl('sidebar', sidebarBg),
    decl('sidebar-foreground', sidebarFg),
    decl('sidebar-accent', sidebarAccent),
    decl('sidebar-accent-foreground', readableOn(sidebarAccent)),
    decl('sidebar-border', sidebarBorder),
    primaryRamp(primaryRaw, 'light'),
  ].join('');

  // Dark theme: brand surfaces get *deeper* (a bright gradient bar is glare at night)
  // while brand *text and pills* get lighter so they stay readable on dark cards.
  const darkPrimary = forDarkSurface(primaryRaw);
  // The gradient chrome is a *ceiling* in dark mode, not a nudge. A bright brand
  // shifted down by a fixed amount is still bright, and the header and footer
  // strips are the largest painted areas on the screen — at night they become the
  // glare source, and the app stops reading as dark at all. Capping the lightness
  // makes the result the same depth whatever the operator configured.
  const darkFrom = withLightness(primary, Math.min(primary.l - 16, 30));
  const darkTo = withLightness(gradientTo, Math.min(gradientTo.l - 20, 25));
  const darkSidebarBg = shiftLightness(sidebarBg, sidebarDark ? -3 : -70);

  const dark = [
    decl('primary', darkPrimary),
    decl('primary-foreground', readableOn(darkPrimary)),
    decl('ring', darkPrimary),
    decl('brand', darkPrimary),
    decl('brand-foreground', readableOn(darkPrimary)),
    decl('brand-accent', forDarkSurface(accentRaw)),
    decl('brand-accent-foreground', readableOn(forDarkSurface(accentRaw))),
    decl('brand-from', darkFrom),
    decl('brand-to', darkTo),
    decl('sidebar', darkSidebarBg),
    decl('sidebar-foreground', sidebarFg),
    decl('sidebar-accent', forDarkSurface(primaryRaw)),
    decl('sidebar-accent-foreground', readableOn(forDarkSurface(primaryRaw))),
    decl('sidebar-border', shiftLightness(darkSidebarBg, 8)),
    primaryRamp(primaryRaw, 'dark'),
  ].join('');

  return `:root:root{${light}}html.dark:root{${dark}}`;
}

/** Expand `{year}` in the operator-authored footer text. */
export function renderFooterText(text: string | null, year: number): string | null {
  if (!text) return null;
  return text.replace(/\{year\}/g, String(year));
}
