'use client';

import { Heart } from 'lucide-react';
import { renderFooterText } from '@/lib/branding';
import { useBranding } from '@/lib/hooks/useBranding';

// App footer — bookends the gradient header with a matching brand strip so
// every page closes on the same colour identity.

export default function Footer() {
  const branding = useBranding();
  const year = new Date().getFullYear();
  const custom = renderFooterText(branding.footer_text, year);

  return (
    <footer className="mt-auto">
      {/* Thin accent line echoing the header gradient. */}
      <div className="bg-brand-gradient h-0.5 w-full" />
      <div className="bg-brand-gradient flex flex-col items-center justify-between gap-2 px-4 py-3 text-center text-white sm:flex-row sm:px-6 sm:text-start">
        <span className="text-xs text-white/90">
          {custom ?? (
            <>
              © {year} <span className="font-semibold">{branding.project_name}</span>
              <span className="hidden text-white/60 sm:inline">
                {' '}· Customs Clearance &amp; Logistics ERP
              </span>
            </>
          )}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-white/70">
          Designed by <Heart className="h-3 w-3 fill-rose-300 text-rose-300" /> Team Aspire
        </span>
      </div>
    </footer>
  );
}
