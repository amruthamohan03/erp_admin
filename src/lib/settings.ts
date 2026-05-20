import { cache } from 'react';
import { db } from './db';
import { applicationSettings, type ApplicationSettingsRow } from '@/db/schema';

export interface AppSettings {
  project_name: string;
  app_title: string;
  tagline: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  accent_color: string;
  sidebar_bg: string;
  sidebar_fg: string;
}

const DEFAULTS: AppSettings = {
  project_name: 'ERP Admin',
  app_title: 'ERP Admin',
  tagline: 'Management Console',
  logo_url: null,
  favicon_url: null,
  primary_color: '#2563eb',
  accent_color: '#2563eb',
  sidebar_bg: '#0f172a',
  sidebar_fg: '#e2e8f0',
};

function toSettings(row: ApplicationSettingsRow): AppSettings {
  return {
    project_name: row.projectName,
    app_title: row.appTitle,
    tagline: row.tagline,
    logo_url: row.logoUrl,
    favicon_url: row.faviconUrl,
    primary_color: row.primaryColor,
    accent_color: row.accentColor,
    sidebar_bg: row.sidebarBg,
    sidebar_fg: row.sidebarFg,
  };
}

// Reads the singleton row (id=1). If the table is empty (fresh install
// before someone opens the settings page) it seeds defaults so the rest of
// the app can render. Cached per-render via React's `cache` so a single
// request that touches settings in multiple components hits Postgres once.
export const getAppSettings = cache(async (): Promise<AppSettings> => {
  try {
    const row = await db.query.applicationSettings.findFirst();
    if (row) return toSettings(row);

    const [created] = await db
      .insert(applicationSettings)
      .values({ id: 1 })
      .onConflictDoNothing()
      .returning();
    if (created) return toSettings(created);

    // Race: another request inserted concurrently. Re-read.
    const retry = await db.query.applicationSettings.findFirst();
    if (retry) return toSettings(retry);

    return DEFAULTS;
  } catch {
    // DB unavailable (e.g. during build with no live DB) — return defaults so
    // the layout still renders.
    return DEFAULTS;
  }
});

// CSS variables in globals.css are stored as HSL triples (e.g. "221 83% 53%")
// so they can be wrapped in hsl(var(--name) / <alpha>). Convert a hex string
// into the same format for runtime overrides.
export function hexToHslVar(hex: string): string {
  const cleaned = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(cleaned)) return '';
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Pick a readable foreground (white / near-black) for a given background hex.
// Used to derive --primary-foreground from the user's primary color.
export function readableForeground(hex: string): string {
  const cleaned = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(cleaned)) return '0 0% 100%';
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // Relative luminance — threshold at 0.55 picks dark text for bright colors.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '222 47% 11%' : '0 0% 100%';
}

// Build the CSS that overrides the variables in globals.css with the
// user's chosen palette. Applied via <style> in the root layout.
export function buildSettingsCss(s: AppSettings): string {
  const primary = hexToHslVar(s.primary_color);
  const accent = hexToHslVar(s.accent_color);
  const sidebarBg = hexToHslVar(s.sidebar_bg);
  const sidebarFg = hexToHslVar(s.sidebar_fg);
  const primaryFg = readableForeground(s.primary_color);
  const sidebarAccentFg = readableForeground(s.primary_color);

  const lines: string[] = [];
  if (primary) {
    lines.push(`--primary: ${primary};`);
    lines.push(`--primary-foreground: ${primaryFg};`);
    lines.push(`--ring: ${primary};`);
    lines.push(`--sidebar-accent: ${primary};`);
    lines.push(`--sidebar-accent-foreground: ${sidebarAccentFg};`);
  }
  if (accent) {
    lines.push(`--accent: ${accent};`);
  }
  if (sidebarBg) {
    lines.push(`--sidebar: ${sidebarBg};`);
  }
  if (sidebarFg) {
    lines.push(`--sidebar-foreground: ${sidebarFg};`);
  }

  if (lines.length === 0) return '';
  return `:root{${lines.join('')}}.dark{${lines.join('')}}`;
}
