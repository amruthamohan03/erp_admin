'use client';

import { useContext } from 'react';
import { BrandingContext } from '@/components/providers/BrandingProvider';
import { BRANDING_DEFAULTS, type Branding } from '@/lib/branding';

// Shared app branding (name, tagline, logo, palette) from application_settings.
// The value is server-resolved once per request and passed through context, so no
// component refetches it and there is no null/loading state to guard (§4.10).

export type { Branding };

export function useBranding(): Branding {
  return useContext(BrandingContext) ?? BRANDING_DEFAULTS;
}
