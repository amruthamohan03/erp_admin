'use client';

import { buildExportHref, buildTabEndpoint } from '../dashboardEndpoints';

// The Export dashboard's two endpoints. The shapes are shared with the Import
// dashboard (`../dashboardEndpoints`); only the module name differs, and
// binding it here keeps every call site free of it.

export { useTabData } from '../useTabData';

export const tabEndpoint = (tab: string, params?: Record<string, string | undefined>): string =>
  buildTabEndpoint('exports', tab, params);

export const exportHref = (params: Record<string, string | number | undefined>): string =>
  buildExportHref('exports', params);
