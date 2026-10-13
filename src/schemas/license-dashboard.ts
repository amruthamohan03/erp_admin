import { z } from 'zod';

// Boundary schemas for the Licence dashboard's tabs (§4.7).

export const LICENSE_DASHBOARD_TABS = ['overview', 'expiry', 'clients'] as const;

export const licenseDashboardTabSchema = z.enum(LICENSE_DASHBOARD_TABS, {
  errorMap: () => ({
    message: `Unknown dashboard tab. Expected one of: ${LICENSE_DASHBOARD_TABS.join(', ')}.`,
  }),
});

/** Which side of the business the dashboard reports on. */
export const licenseUseForSchema = z.enum(['import', 'export']).optional();

export const LICENSE_EXPORT_SCOPES = ['dashboard', 'licenses', 'expiry', 'client'] as const;

export const licenseDashboardExportSchema = z
  .object({
    scope: z.enum(LICENSE_EXPORT_SCOPES, {
      errorMap: () => ({ message: 'Unknown export scope.' }),
    }),
    use_for: licenseUseForSchema,
    client_id: z.coerce
      .number()
      .int('A client is identified by a whole number.')
      .positive('A client is identified by a positive number.')
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'client' && v.client_id === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['client_id'],
        message: 'Choose which client to export.',
      });
    }
  });
export type LicenseDashboardExportQuery = z.infer<typeof licenseDashboardExportSchema>;
