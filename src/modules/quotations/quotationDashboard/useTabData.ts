'use client';

import { buildExportHref, buildTabEndpoint } from '@/modules/tracking/dashboardEndpoints';

// The Quotation dashboard's endpoints. The shapes are shared with the tracking
// and licence dashboards (`dashboardEndpoints`); only the module name differs,
// and binding it here keeps every call site free of it (§4.10).

export { useTabData } from '@/lib/hooks/useFetchedData';

export const tabEndpoint = (tab: string): string => buildTabEndpoint('quotations', tab);

export const clientEndpoint = (clientId: number): string =>
  `/api/v1/quotations/dashboard/clients/${clientId}`;

export const exportHref = (params: Record<string, string | number | undefined>): string =>
  buildExportHref('quotations', params);
