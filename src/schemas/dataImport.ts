import { z } from 'zod';

// Data Import — the review screen's requests (db/queries/dataImport.ts).
// The uploaded file itself arrives as multipart form data, so only the commit
// body is parsed here.

export const importTargetKeySchema = z
  .string({ invalid_type_error: 'Module: choose what the file is for.' })
  .trim()
  .min(1, 'Module: choose what the file is for.')
  .max(60);

/** POST /data-import/commit — the rows the operator reviewed. */
export const importCommitSchema = z.object({
  target_key: importTargetKeySchema,
  file_name: z.string().trim().min(1).max(255),
  source: z.enum(['spreadsheet', 'document'], {
    errorMap: () => ({ message: 'Source must be a spreadsheet or a scanned document.' }),
  }),
  /** Heading → field name, as committed; null means the column was left out. */
  mapping: z.record(z.string(), z.string().nullable()).default({}),
  /** Keep the mapping, so the next file with these headings maps itself. */
  remember_mapping: z.boolean().default(false),
  rows: z
    .array(
      z.object({
        row_number: z.coerce.number().int().min(1),
        values: z.record(z.string(), z.string()),
      }),
    )
    .min(1, 'There is nothing to import — every row was left out.')
    .max(2000, 'Import at most 2000 rows at a time.'),
});
export type ImportCommitBody = z.infer<typeof importCommitSchema>;

/** GET /data-import/batches/{id} */
export const importBatchIdSchema = z.coerce
  .number({ invalid_type_error: 'The import id must be a number.' })
  .int()
  .positive('The import id must be a positive whole number.');
