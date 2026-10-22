'use client';

import { buildExportHref, buildTabEndpoint } from '@/modules/tracking/dashboardEndpoints';
import type { FicheExportScope } from '@/schemas/fiche-dashboard';

// The Fiche de Calcul dashboard's endpoints, bound once so no tab spells out a
// module path (§4.10).

export { useTabData } from '@/lib/hooks/useFetchedData';

export const tabEndpoint = (tab: string): string => buildTabEndpoint('fiches', tab);

export const exportHref = (scope: FicheExportScope): string => buildExportHref('fiches', { scope });

/** The fiche's own edit screen (the 'fiche' transaction page). */
export const ficheHref = (id: number): string => `/fiches/${id}`;
