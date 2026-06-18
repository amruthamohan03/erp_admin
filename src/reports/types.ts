import { z } from 'zod';

// Public types for the report registry per CLAUDE.md §2 step 7. The
// presentation half (name, category, columns) lives in
// report_definition_master_t; this file defines the *code* contract a
// handler implements.

export const reportColumnSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  /** Drives default formatting in the viewer. */
  type: z.enum(['text', 'number', 'date', 'money', 'status']),
  /** Optional cell alignment ("left" | "right" | "center"). Defaults left. */
  align: z.enum(['left', 'right', 'center']).optional(),
});

export const reportColumnsSchema = z.array(reportColumnSchema).min(1);

export type ReportColumn = z.infer<typeof reportColumnSchema>;

/**
 * A handler takes the *Zod-validated* parameter object (or undefined for
 * parameterless reports) and returns a list of result rows. The handler
 * is trusted code — runReport already validated `params` against the
 * linked form_definition before calling.
 */
export type ReportHandler = (
  params: Record<string, unknown> | undefined,
) => Promise<Array<Record<string, unknown>>>;

/**
 * Whether a handler is registered for a key. Used by runReport to give a
 * clear "report definition exists but no code is wired up" error rather
 * than a generic 500.
 */
export interface ReportRegistryEntry {
  handler: ReportHandler;
  /** Human description; surfaces in error messages if the handler throws. */
  description?: string;
}
