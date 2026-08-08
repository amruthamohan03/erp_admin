'use client';

import { createContext, type ReactNode } from 'react';
import type { Branding } from '@/lib/branding';

// Branding is resolved on the server (root layout) and handed down, so the header,
// footer and sidebar render the right name and logo on the very first paint instead
// of flashing a placeholder while a client fetch lands. Consumers use
// `useBranding()` from @/lib/hooks/useBranding.

export const BrandingContext = createContext<Branding | null>(null);

export default function BrandingProvider({
  branding,
  children,
}: {
  branding: Branding;
  children: ReactNode;
}) {
  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}
