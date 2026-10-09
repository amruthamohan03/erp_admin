import { z } from 'zod';
// Both key sets come from the pure definitions module, never from the query
// registry: this schema is parsed in the browser too (§4.23), and importing
// anything that reaches `@/lib/db` would pull the pg driver into the bundle.
import { EXPORT_DATE_FIELD_KEYS, EXPORT_REPORT_KEYS } from '@/lib/tracking/exportDateFields';

// Boundary schemas for the Export Tracking dashboard (§4.7).
//
// The key sets are derived from the shared definitions rather than retyped —
// main repeated its 28-entry `$allowedDateFields` array three times in one
// controller, so the three could and did drift. A key the UI cannot offer is
// rejected here rather than reaching `sql.identifier` (§4.10).

export const EXPORT_DASHBOARD_TABS = [
  'overview',
  'logistics',
  'triphase',
  'prepayment',
  'report',
] as const;

export const exportDashboardTabSchema = z.enum(EXPORT_DASHBOARD_TABS, {
  errorMap: () => ({
    message: `Unknown dashboard tab. Expected one of: ${EXPORT_DASHBOARD_TABS.join(', ')}.`,
  }),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'A date must be in YYYY-MM-DD form.');

/** The tab exports, which take no arguments beyond the scope itself. */
export const EXPORT_TAB_SCOPES = ['overview', 'logistics', 'triphase', 'prepayment', 'all'] as const;

export const EXPORT_DASHBOARD_SCOPES = [
  ...EXPORT_TAB_SCOPES,
  'report',
  'custom',
] as const;

/**
 * One export request.
 *
 * A `report` needs its report key and both dates; a `custom` needs a date field
 * and both dates. Anything missing is a 422 naming the field (§4.23) rather
 * than a spreadsheet of the whole book under a name suggesting otherwise.
 */
export const exportDashboardExportSchema = z
  .object({
    scope: z.enum(EXPORT_DASHBOARD_SCOPES, {
      errorMap: () => ({ message: 'Unknown export scope.' }),
    }),
    report: z
      .enum([...EXPORT_REPORT_KEYS] as [string, ...string[]], {
        errorMap: () => ({ message: 'Unknown report.' }),
      })
      .optional(),
    field: z
      .enum([...EXPORT_DATE_FIELD_KEYS] as [string, ...string[]], {
        errorMap: () => ({ message: 'Unknown date field for an export file.' }),
      })
      .optional(),
    client_id: z.coerce
      .number()
      .int('A client is identified by a whole number.')
      .positive('A client is identified by a positive number.')
      .optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'report' && !v.report) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['report'], message: 'Choose which report to export.' });
    }
    if (v.scope === 'custom' && !v.field) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['field'], message: 'Choose which date field to export.' });
    }
    const needsRange = v.scope === 'report' || v.scope === 'custom';
    if (needsRange && !v.from) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'Select a start date.' });
    }
    if (needsRange && !v.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'Select an end date.' });
    }
    if (v.from && v.to && v.from > v.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'The end date cannot be before the start date.',
      });
    }
  });
export type ExportDashboardExportQuery = z.infer<typeof exportDashboardExportSchema>;
