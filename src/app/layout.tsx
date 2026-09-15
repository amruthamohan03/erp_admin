import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import BrandingProvider from '@/components/providers/BrandingProvider';
import ThemeProvider from '@/components/providers/ThemeProvider';
import { loadBranding } from '@/db/queries/branding';
import { BRANDING_DEFAULTS, brandingCssVars } from '@/lib/branding';
import { loadActionStyles } from '@/db/queries/actionStyles';
import { actionStyleCssVars } from '@/lib/actionStyles';
import './globals.css';

// §4.31 — the app's type. Loaded through `next/font`, which downloads the files at
// BUILD time and serves them from our own origin: no request to a third party at
// runtime, no flash of unstyled text, and a fallback whose metrics are adjusted to
// match so swapping it in shifts nothing on the page.
//
// Inter is drawn for screen UI at small sizes — tall x-height, unambiguous 1/l/I and
// 0/O, and real tabular figures, which is what a screen full of licence numbers,
// tonnages and amounts needs. `cv05`/`cv08` are the single-storey `l` and upright `t`
// alternates; `tnum` keeps every digit the same width so a column of figures lines up
// without each call site remembering `tabular-nums`.
const sans = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-sans',
  axes: ['opsz'],
});

// Reference numbers, DDU/BL codes and IDs render in mono all over this app (~100
// call sites). Left to the system stack that means Courier New on Windows, which
// sits badly beside a modern sans — so the mono half of the pairing is chosen too.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

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
  // Resolved server-side so the configured palette is in the first HTML response —
  // a client-side apply would flash the default brand on every navigation.
  const [branding, actionStyles] = await Promise.all([loadBranding(), loadActionStyles()]);

  return (
    // The app ships in English. The machine-translation layer that used to swap
    // this per request is gone: it re-translated the DOM on every navigation,
    // which fought the renderer, and it could silently rewrite operator data —
    // a client short name or an MCA reference is not prose to be translated.
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
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
            {children}
          </BrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
