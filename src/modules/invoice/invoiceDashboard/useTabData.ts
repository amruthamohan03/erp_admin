'use client';

import { buildExportHref, buildTabEndpoint } from '@/modules/tracking/dashboardEndpoints';
import type { InvoiceExportScope, InvoiceKind } from '@/schemas/invoice-dashboard';

// The invoice dashboards' endpoints. One kind-aware pair for both, so no tab
// spells out a module path and the two dashboards cannot drift (§4.10).

export { useTabData } from '@/lib/hooks/useFetchedData';

export const invoiceModule = (kind: InvoiceKind): 'export-invoices' | 'import-invoices' =>
  kind === 'export' ? 'export-invoices' : 'import-invoices';

export const tabEndpoint = (kind: InvoiceKind, tab: string): string =>
  buildTabEndpoint(invoiceModule(kind), tab);

export const exportHref = (kind: InvoiceKind, scope: InvoiceExportScope): string =>
  buildExportHref(invoiceModule(kind), { scope });

/** The invoice's own edit screen, as the invoice list links it. */
export const invoiceHref = (kind: InvoiceKind, id: number): string => `/${invoiceModule(kind)}/${id}`;

export const KIND_LABEL: Record<InvoiceKind, string> = { export: 'Export', import: 'Import' };
