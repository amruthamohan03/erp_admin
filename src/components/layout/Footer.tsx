'use client';

import { Heart } from 'lucide-react';
import { useBranding } from '@/lib/hooks/useBranding';

// App footer — bookends the gradient header with a matching brand strip so
// every page closes on the same colour identity.

export default function Footer() {
  const branding = useBranding();
  const year = new Date().getFullYear();
  const name = branding?.project_name ?? 'ERP Admin';

  return (
    <footer className="mt-auto">
      {/* Thin accent line echoing the header gradient. */}
      <div className="h-0.5 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600" />
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-6 py-3 text-white bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-700 dark:from-indigo-700 dark:via-violet-800 dark:to-purple-900">
        <span className="text-xs text-white/90">
          © {year} <span className="font-semibold">{name}</span>
          <span className="hidden sm:inline text-white/60">
            {' '}· Customs Clearance &amp; Logistics ERP
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-white/70">
          Designed by <Heart className="h-3 w-3 fill-rose-300 text-rose-300" /> Team Aspire
        </span>
      </div>
    </footer>
  );
}
