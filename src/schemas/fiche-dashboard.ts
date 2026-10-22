import { z } from 'zod';

// Boundary schemas for the Fiche de Calcul dashboard (§4.7).
//
// Pure — nothing here imports the database, so the browser can share it.

export const FICHE_DASHBOARD_TABS = ['overview', 'workflow', 'clients', 'duties'] as const;
export type FicheDashboardTab = (typeof FICHE_DASHBOARD_TABS)[number];

export const ficheDashboardTabSchema = z.enum(FICHE_DASHBOARD_TABS, {
  errorMap: () => ({
    message: `Unknown dashboard tab. Expected one of: ${FICHE_DASHBOARD_TABS.join(', ')}.`,
  }),
});

export const FICHE_EXPORT_SCOPES = ['dashboard', 'fiches', 'waiting', 'clients', 'hscodes'] as const;
export type FicheExportScope = (typeof FICHE_EXPORT_SCOPES)[number];

export const ficheDashboardExportSchema = z.object({
  scope: z.enum(FICHE_EXPORT_SCOPES, {
    errorMap: () => ({
      message: `Unknown export scope. Expected one of: ${FICHE_EXPORT_SCOPES.join(', ')}.`,
    }),
  }),
});
export type FicheDashboardExportQuery = z.infer<typeof ficheDashboardExportSchema>;
