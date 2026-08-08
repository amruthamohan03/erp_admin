import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { applicationSettingsMaster, type ApplicationSettingsRow } from '@/db/schema';
import { BRANDING_DEFAULTS, type Branding } from '@/lib/branding';

// Read side of the branding singleton. The root layout needs it on every request to
// inline the palette before first paint, and /api/v1/application-settings needs the
// same row→DTO mapping for its response — so both call in here rather than each
// spelling out the column mapping (§4.10, §7.4).

export const BRANDING_SINGLETON_ID = 1;

/** Snake-case DTO for the API boundary and the client provider. */
export function brandingFromRow(row: ApplicationSettingsRow): Branding {
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
    footer_text: row.footerText,
  };
}

/**
 * Branding for server rendering, deduped per request by React `cache`.
 *
 * Never throws: the root layout wraps the login page too, and a database blip must
 * degrade to the default palette rather than blanking the app.
 */
export const loadBranding = cache(async (): Promise<Branding> => {
  try {
    const [row] = await db
      .select()
      .from(applicationSettingsMaster)
      .where(eq(applicationSettingsMaster.id, BRANDING_SINGLETON_ID))
      .limit(1);
    return row ? brandingFromRow(row) : BRANDING_DEFAULTS;
  } catch {
    return BRANDING_DEFAULTS;
  }
});
