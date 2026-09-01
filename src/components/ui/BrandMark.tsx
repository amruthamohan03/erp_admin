'use client';

import { useId } from 'react';

// The app's identity mark, in one place (§4.8, §4.10).
//
// The sidebar and the login screen previously fell back to two *different*
// stand-in glyphs — a generic grid icon in one and an unrelated wave path in the
// other — so an install with no uploaded logo had no consistent identity at all.
//
// Colour comes from `--brand-from` / `--brand-to`, the same two tokens the header
// gradient reads, which `brandingCssVars` derives from the operator's configured
// primary and accent (§4.1, §4.20). Change the palette on /settings/application
// and this mark follows — it is never a hardcoded hex.
//
// The static twin of this file is public/brand/erp-admin-mark.svg, which bakes in
// the *default* palette because a favicon file cannot read CSS variables. The two
// are the same geometry; keep them in step.

export default function BrandMark({
  className,
  title = 'ERP Admin',
}: {
  className?: string;
  /** Empty string marks it decorative — use that when a visible name sits beside it. */
  title?: string;
}) {
  // Two of these can be on screen at once (sidebar + a dialog). A shared
  // gradient id would let whichever unmounts last take the other's fill with it.
  const gradientId = useId();

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(var(--brand-from))" />
          <stop offset="1" stopColor="hsl(var(--brand-to))" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gradientId})`} />
      {/* An E monogram: spine plus three bars, the middle one short. Geometry is
          on a 4px grid so the strokes stay crisp when the tile is scaled down to
          a 16px favicon. */}
      <g fill="hsl(var(--brand-foreground))">
        <rect x="18" y="16" width="8" height="32" rx="4" />
        <rect x="18" y="16" width="28" height="8" rx="4" />
        <rect x="18" y="28" width="20" height="8" rx="4" />
        <rect x="18" y="40" width="28" height="8" rx="4" />
      </g>
    </svg>
  );
}
