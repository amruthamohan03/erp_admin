import { z } from 'zod';
import {
  IMPORT_DATE_FIELD_KEYS,
  IMPORT_PIPELINE_KEYS,
} from '@/lib/tracking/importDateFields';
import { ROAD_MILESTONE_KEYS } from '@/lib/tracking/roadMilestones';

// Boundary schemas for the Import Tracking dashboard's analysis tabs (§4.7).
//
// The three key sets are derived from the shared definitions rather than
// retyped, so a new date field or road leg is accepted by the API the moment it
// is added to the list the UI renders from — and a key the UI cannot offer is
// rejected here rather than reaching `sql.identifier` (§4.10).

export const IMPORT_DASHBOARD_TABS = [
  'overview',
  'briefing',
  'logistics',
  'triphase',
  'offices',
  'border',
  'reports',
] as const;

export const importDashboardTabSchema = z.enum(IMPORT_DASHBOARD_TABS, {
  errorMap: () => ({
    message: `Unknown dashboard tab. Expected one of: ${IMPORT_DASHBOARD_TABS.join(', ')}.`,
  }),
});

/** An ISO date as the browser's date input emits it. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'A date must be in YYYY-MM-DD form.');

/** Filters shared by the Reports tab's counts and every export it offers. */
export const importReportFilterSchema = z.object({
  client_id: z.coerce
    .number()
    .int('A client is identified by a whole number.')
    .positive('A client is identified by a positive number.')
    .optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type ImportReportFilterQuery = z.infer<typeof importReportFilterSchema>;

const dateFieldKey = z.enum(
  [...IMPORT_DATE_FIELD_KEYS] as [string, ...string[]],
  { errorMap: () => ({ message: 'Unknown date field for an import file.' }) },
);

export const IMPORT_EXPORT_SCOPES = [
  'briefing',
  'border-overstay',
  'stage',
  'missing',
  'pipeline',
  'custom',
] as const;

/**
 * One export request.
 *
 * Every scope is checked for the arguments it actually needs — a `stage` export
 * without a stage, or a `custom` export without both dates, is a 422 naming the
 * missing field (§4.23) rather than a spreadsheet of the whole book.
 */
export const importDashboardExportSchema = importReportFilterSchema
  .extend({
    scope: z.enum(IMPORT_EXPORT_SCOPES, {
      errorMap: () => ({ message: 'Unknown export scope.' }),
    }),
    stage: z
      .enum([...ROAD_MILESTONE_KEYS] as [string, ...string[]], {
        errorMap: () => ({ message: 'Unknown road tracking stage.' }),
      })
      .optional(),
    field: dateFieldKey.optional(),
    step: z
      .enum([...IMPORT_PIPELINE_KEYS] as [string, ...string[]], {
        errorMap: () => ({ message: 'Unknown clearance pipeline step.' }),
      })
      .optional(),
    /**
     * Narrow a `missing` export to files the operation counts as CLEARED.
     *
     * The Briefing tab's cards count missing dates within that scope, so
     * without this their download would hand back every file with the date
     * blank — a sheet whose row count does not match the figure that was
     * clicked. A card must download what it counted (§4.15).
     */
    cleared_only: z
      .enum(['0', '1'])
      .transform((v) => v === '1')
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'stage' && !v.stage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stage'],
        message: 'Choose which tracking stage to export.',
      });
    }
    if ((v.scope === 'missing' || v.scope === 'custom') && !v.field) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['field'],
        message: 'Choose which date field to export.',
      });
    }
    if (v.scope === 'pipeline' && !v.step) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['step'],
        message: 'Choose which pipeline step to export.',
      });
    }
    // A custom export is defined by its range: without one it is simply "every
    // file that has this date", which is the unfiltered book under a name that
    // suggests otherwise.
    if (v.scope === 'custom' && !v.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'A custom export needs a start date.',
      });
    }
    if (v.scope === 'custom' && !v.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'A custom export needs an end date.',
      });
    }
    if (v.from && v.to && v.from > v.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'The end date cannot be before the start date.',
      });
    }
  });
export type ImportDashboardExportQuery = z.infer<typeof importDashboardExportSchema>;
