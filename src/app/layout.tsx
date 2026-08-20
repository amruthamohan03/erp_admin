import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import BrandingProvider from '@/components/providers/BrandingProvider';
import ThemeProvider from '@/components/providers/ThemeProvider';
import TranslateProvider from '@/components/providers/TranslateProvider';
import { loadBranding } from '@/db/queries/branding';
import { BRANDING_DEFAULTS, brandingCssVars } from '@/lib/branding';
import { loadActionStyles } from '@/db/queries/actionStyles';
import { actionStyleCssVars } from '@/lib/actionStyles';
import { defaultLocale, isLocale, LOCALE_COOKIE, localeDirs } from '@/i18n/config';
import './globals.css';

// Tab title and favicon come from the branding row, not from a constant — the
// two fields exist on /settings/application precisely so an operator can change
// them, and a hardcoded `metadata` meant the uploaded favicon was stored and
// then never rendered by anything.
//
// Browsers cache a favicon aggressively, so the upload path deliberately writes
// a fresh filename per upload rather than overwriting one — the URL changing is
// what makes the new icon appear without a hard reload.
export async function generateMetadata(): Promise<Metadata> {
  const branding = await loadBranding();
  const icon = branding.favicon_url?.trim();

  return {
    title: branding.app_title || BRANDING_DEFAULTS.app_title,
    description: branding.tagline || 'Modular ERP admin dashboard',
    ...(icon
      ? { icons: { icon: [{ url: icon }], shortcut: [{ url: icon }], apple: [{ url: icon }] } }
      : {}),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
  const dir = localeDirs[locale];

  // Resolved server-side so the configured palette is in the first HTML response —
  // a client-side apply would flash the default brand on every navigation.
  const [branding, actionStyles] = await Promise.all([loadBranding(), loadActionStyles()]);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        {/* Tabler Icons webfont - powers the `ti ti-*` icon classes from menu_master_t */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.21.0/dist/tabler-icons.min.css"
        />
        {/* Bootstrap Icons - powers the `bi bi-*` icons from dashboard_card_master_t */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
        />
        <style
          id="brand-tokens"
          dangerouslySetInnerHTML={{ __html: brandingCssVars(branding) }}
        />
        {/* §4.26 — per-action colour, inlined before first paint for the same
            reason as the brand palette: the shared action classes read these
            variables, so they must exist before anything renders. */}
        <style
          id="action-tokens"
          dangerouslySetInnerHTML={{ __html: actionStyleCssVars(actionStyles) }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <BrandingProvider branding={branding}>
            <TranslateProvider initialLocale={locale}>{children}</TranslateProvider>
          </BrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
