import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import ThemeProvider from '@/components/providers/ThemeProvider';
import TranslateProvider from '@/components/providers/TranslateProvider';
import { SettingsProvider } from '@/components/providers/SettingsProvider';
import { defaultLocale, isLocale, LOCALE_COOKIE, localeDirs } from '@/i18n/config';
import { buildSettingsCss, getAppSettings } from '@/lib/settings';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAppSettings();
  return {
    title: settings.app_title,
    description: `${settings.project_name} — modular ERP admin dashboard`,
    icons: settings.favicon_url ? { icon: settings.favicon_url } : undefined,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
  const dir = localeDirs[locale];

  const settings = await getAppSettings();
  const overridesCss = buildSettingsCss(settings);

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
        {/* Per-tenant palette overrides from application_settings_t. */}
        {overridesCss && (
          <style dangerouslySetInnerHTML={{ __html: overridesCss }} />
        )}
      </head>
      <body>
        <SettingsProvider value={settings}>
          <ThemeProvider>
            <TranslateProvider initialLocale={locale}>{children}</TranslateProvider>
          </ThemeProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
