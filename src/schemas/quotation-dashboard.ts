import { z } from 'zod';

// Boundary schemas for the Quotation dashboard's tabs (§4.7).
//
// Pure — nothing here imports the database, so the browser can parse a request
// with the same schema the server validates it against. (The Export dashboard's
// schema once imported its report registry and dragged `pg` into the client
// bundle; that is the mistake this file is shaped to avoid.)

export const QUOTATION_DASHBOARD_TABS = ['overview', 'value', 'categories', 'clients'] as const;
export type QuotationDashboardTab = (typeof QUOTATION_DASHBOARD_TABS)[number];

export const quotationDashboardTabSchema = z.enum(QUOTATION_DASHBOARD_TABS, {
  errorMap: () => ({
    message: `Unknown dashboard tab. Expected one of: ${QUOTATION_DASHBOARD_TABS.join(', ')}.`,
  }),
});

export const QUOTATION_EXPORT_SCOPES = ['dashboard', 'quotations', 'categories', 'client'] as const;

export const quotationDashboardExportSchema = z
  .object({
    scope: z.enum(QUOTATION_EXPORT_SCOPES, {
      errorMap: () => ({ message: 'Unknown export scope.' }),
    }),
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
export type QuotationDashboardExportQuery = z.infer<typeof quotationDashboardExportSchema>;
