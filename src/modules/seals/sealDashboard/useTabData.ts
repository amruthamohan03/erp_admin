'use client';

import { buildExportHref, buildTabEndpoint } from '@/modules/tracking/dashboardEndpoints';
import { nf2 } from '@/modules/tracking/dashboardUi';
import type { SealExportScope } from '@/schemas/seal-dashboard';

// The Seal Tracker dashboard's endpoints, bound once so no tab spells out a
// module path (§4.10).

export { useTabData } from '@/lib/hooks/useFetchedData';

export const tabEndpoint = (tab: string): string => buildTabEndpoint('seals', tab);

export const exportHref = (scope: SealExportScope): string => buildExportHref('seals', { scope });

/** The batch detail screen, as the Seals list links it. */
export const batchHref = (id: number): string => `/masters/seals/${id}`;

/** The export file's own edit screen. */
export const exportFileHref = (id: number): string => `/exports/${id}`;

export const usd = (n: number): string => `$${nf2.format(n)}`;
