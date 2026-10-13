'use client';

import { buildExportHref, buildTabEndpoint } from '@/modules/tracking/dashboardEndpoints';

// The Licence dashboard's two endpoints. The shapes are shared with the
// tracking dashboards (`dashboardEndpoints`); only the module name and the
// `use_for` scope differ, and binding both here keeps every call site free of
// them (§4.10).

export { useTabData } from '@/lib/hooks/useFetchedData';

export type LicenseUseForValue = 'import' | 'export' | undefined;

export const tabEndpoint = (
  tab: string,
  useFor: LicenseUseForValue,
  params?: Record<string, string | undefined>,
): string => buildTabEndpoint('licenses', tab, { use_for: useFor, ...params });

export const clientEndpoint = (clientId: number, useFor: LicenseUseForValue): string =>
  `/api/v1/licenses/dashboard/clients/${clientId}${useFor ? `?use_for=${useFor}` : ''}`;

export const exportHref = (
  params: Record<string, string | number | undefined>,
): string => buildExportHref('licenses', params);
