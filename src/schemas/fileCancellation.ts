import { z } from 'zod';

// §2 step 3 — the File Cancellation screen's request bodies.

/** The tracking modules a file can be cancelled from. */
export const FILE_KINDS = ['import', 'export', 'local'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

const fileKind = z.enum(FILE_KINDS, {
  errorMap: () => ({ message: 'Tracking Type: choose Import, Export or Local.' }),
});

const idList = (label: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      const ids = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
      if (ids.some((n) => !Number.isInteger(n) || n < 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a comma-separated list of ids.` });
        return z.NEVER;
      }
      return ids;
    });

/** GET /file-cancellations/options — what the pickers offer. */
export const fileCancellationOptionsQuery = z.object({
  kind: fileKind,
  client_id: z.coerce.number({ invalid_type_error: 'Client: choose a client.' }).int().positive('Client: choose a client.'),
  license_ids: idList('License Numbers'),
});

/** POST /file-cancellations — cancel the chosen files. */
export const fileCancellationSchema = z.object({
  kind: fileKind,
  client_id: z.coerce.number().int().positive('Client: choose a client.'),
  file_ids: z
    .array(z.coerce.number().int().positive())
    .min(1, 'MCA References: choose at least one file to cancel.')
    .max(200, 'MCA References: cancel at most 200 files at a time.'),
  reason_id: z.coerce
    .number({ invalid_type_error: 'Cancellation Reason: choose a reason.' })
    .int()
    .positive('Cancellation Reason: choose a reason.'),
  cancelled_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Cancelled Date must be a date.')
    .refine((d) => d <= new Date().toISOString().slice(0, 10), 'Cancelled Date cannot be in the future.'),
  /**
   * The operator has seen the payment requests on these files and confirms.
   * Without it, a file with payment requests is returned for confirmation.
   */
  acknowledge_payments: z.boolean().default(false),
});

/** GET /file-cancellations/payments?kind=&file_id= — one cancelled file's payment requests. */
export const cancelledFilePaymentsQuery = z.object({
  kind: fileKind,
  file_id: z.coerce.number().int().positive('The file id must be a positive whole number.'),
});

/** PUT /file-cancellations/recollections/{id} — record what was recovered. */
export const recollectionUpdateSchema = z
  .object({
    status: z.enum(['pending', 'recovered', 'written_off'], {
      errorMap: () => ({ message: 'Status must be Pending, Recovered or Written off.' }),
    }),
    recovered_amount: z.coerce
      .number({ invalid_type_error: 'Recovered Amount must be a number.' })
      .min(0, 'Recovered Amount cannot be negative.')
      .nullable()
      .default(null),
    recovered_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Recovered Date must be a date.')
      .nullable()
      .default(null),
    note: z.string().trim().max(1000, 'Note must be 1000 characters or fewer.').nullable().default(null),
  })
  .refine((v) => v.status !== 'recovered' || (v.recovered_amount ?? 0) > 0, {
    message: 'Recovered Amount: enter how much was recovered.',
    path: ['recovered_amount'],
  })
  .refine((v) => v.status === 'pending' || !!v.recovered_date, {
    message: 'Recovered Date: enter when it was settled.',
    path: ['recovered_date'],
  });

export const recollectionIdSchema = z.coerce
  .number({ invalid_type_error: 'The recollection id must be a number.' })
  .int()
  .positive();
export type FileCancellationInput = z.infer<typeof fileCancellationSchema>;
