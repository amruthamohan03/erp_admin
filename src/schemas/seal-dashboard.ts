import { z } from 'zod';

// Boundary schemas for the Seal Tracker dashboard (§4.7).
//
// Pure — nothing here imports the database, so the browser can share it.

export const SEAL_DASHBOARD_TABS = ['stock', 'batches', 'usage'] as const;
export type SealDashboardTab = (typeof SEAL_DASHBOARD_TABS)[number];

export const sealDashboardTabSchema = z.enum(SEAL_DASHBOARD_TABS, {
  errorMap: () => ({
    message: `Unknown dashboard tab. Expected one of: ${SEAL_DASHBOARD_TABS.join(', ')}.`,
  }),
});

export const SEAL_EXPORT_SCOPES = ['dashboard', 'seals', 'offices', 'batches', 'files', 'clients'] as const;
export type SealExportScope = (typeof SEAL_EXPORT_SCOPES)[number];

export const sealDashboardExportSchema = z.object({
  scope: z.enum(SEAL_EXPORT_SCOPES, {
    errorMap: () => ({
      message: `Unknown export scope. Expected one of: ${SEAL_EXPORT_SCOPES.join(', ')}.`,
    }),
  }),
});
export type SealDashboardExportQuery = z.infer<typeof sealDashboardExportSchema>;
