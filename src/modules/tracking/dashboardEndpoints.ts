// The two URL shapes every tracking dashboard uses.
//
// Both the Import and the Export dashboard expose the same pair of endpoints —
// one per-tab data route and one export route — differing only in the module
// segment. Each dashboard binds its own module in a two-line module file, so no
// call site carries the name and the two can never drift apart (§4.10).

export type TrackingModule = 'imports' | 'exports';

/** The tab data endpoint for one tab key. */
export function buildTabEndpoint(
  module: TrackingModule,
  tab: string,
  params?: Record<string, string | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) qs.set(k, v);
  const q = qs.toString();
  return `/api/v1/${module}/dashboard/tabs/${tab}${q ? `?${q}` : ''}`;
}

/** The export endpoint for one scope, with only the arguments it carries. */
export function buildExportHref(
  module: TrackingModule,
  params: Record<string, string | number | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  return `/api/v1/${module}/dashboard/export?${qs.toString()}`;
}

/**
 * Start a file download without navigating the page.
 *
 * `window.location.href = url` works — the browser cancels the navigation once
 * it sees the attachment header — but it asks the page to leave and leaves the
 * operator's filters behind if anything goes wrong. A synthetic anchor click
 * downloads in place, and does not assign to a value React's rules consider
 * outside the component.
 */
export function startDownload(href: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
