import { z } from 'zod';

// Boundary schemas for the Export Invoice and Import Invoice dashboards (§4.7).
//
// One file for both: the two dashboards have the same tabs and the same export
// scopes, and differ only in which invoice table they read — which the route
// decides, not the request.
//
// Pure — nothing here imports the database, so the browser can share it.

export const INVOICE_KINDS = ['export', 'import'] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_DASHBOARD_TABS = ['overview', 'clients', 'validation', 'payment'] as const;
export type InvoiceDashboardTab = (typeof INVOICE_DASHBOARD_TABS)[number];

export const invoiceDashboardTabSchema = z.enum(INVOICE_DASHBOARD_TABS, {
  errorMap: () => ({
    message: `Unknown dashboard tab. Expected one of: ${INVOICE_DASHBOARD_TABS.join(', ')}.`,
  }),
});

export const INVOICE_EXPORT_SCOPES = ['dashboard', 'invoices', 'clients', 'pending', 'payment'] as const;
export type InvoiceExportScope = (typeof INVOICE_EXPORT_SCOPES)[number];

export const invoiceDashboardExportSchema = z.object({
  scope: z.enum(INVOICE_EXPORT_SCOPES, {
    errorMap: () => ({
      message: `Unknown export scope. Expected one of: ${INVOICE_EXPORT_SCOPES.join(', ')}.`,
    }),
  }),
});
export type InvoiceDashboardExportQuery = z.infer<typeof invoiceDashboardExportSchema>;
