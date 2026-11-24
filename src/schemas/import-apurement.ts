import { z } from 'zod';

// Import License → Import Apurement — request schemas (§4.7).

/** The menu URL every Import Apurement route checks permissions against (0171). */
export const IMPORT_APUREMENT_RESOURCE = '/import-apurement';

/** Rows one Save may carry — the legacy screen's own cap. */
export const APUREMENT_SAVE_MAX_ROWS = 2000;

const id = (label: string) => z.coerce.number().int().positive(`${label} must be chosen.`);
const optionalId = z.coerce.number().int().positive().optional();
const isoDate = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, `${label} must be a date (YYYY-MM-DD).`);

/** A filter by client; absent means every client. */
export const apurementClientQuerySchema = z.object({ client_id: optionalId });
export type ApurementClientQuery = z.infer<typeof apurementClientQuerySchema>;

/** `pending` — clients with files to complete; `ready` — clients with files to transmit. */
export const apurementClientsQuerySchema = z.object({
  state: z.enum(['pending', 'ready'], { errorMap: () => ({ message: 'State must be pending or ready.' }) }).default('pending'),
});

/** The pending grid is always one client's — the legacy screen opened it per client. */
export const apurementPendingQuerySchema = z.object({ client_id: id('Client') });

/**
 * A cleared dropdown posts `''` or `null`, which means "no value" rather than a
 * validation failure. Absent means "leave as it is".
 */
const optionRef = z
  .union([z.coerce.number().int().positive(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' ? null : v));

export const apurementRowSchema = z.object({
  import_id: z.coerce.number().int().positive('Each row must name its file.'),
  ass_ref: z
    .string()
    .trim()
    .max(100, 'ASS REF must be 100 characters or fewer.')
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  clearance_type_id: optionRef,
  clearance_remark_id: optionRef,
});
export type ApurementRowInput = z.infer<typeof apurementRowSchema>;

/** The pending grid's one Save — every edited row in one request, one transaction. */
export const apurementSaveSchema = z.object({
  rows: z
    .array(apurementRowSchema)
    .min(1, 'There is nothing to save — edit a row first.')
    .max(APUREMENT_SAVE_MAX_ROWS, `One save can carry at most ${APUREMENT_SAVE_MAX_ROWS} rows — save in smaller batches.`),
});
export type ApurementSaveInput = z.infer<typeof apurementSaveSchema>;

export const apurementAutoAssRefSchema = z.object({ client_id: id('Client') });

export const transmissionListQuerySchema = z.object({
  client_id: optionalId,
  /** `with` / `without` an acknowledgement of receipt; absent means both. */
  ar: z.enum(['with', 'without']).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type TransmissionListQuery = z.infer<typeof transmissionListQuerySchema>;

/**
 * No reference field: the generator issues it inside the create's transaction
 * (§4.33 rule 2), so the number a screen previews can never be typed wrong.
 */
export const transmissionCreateSchema = z
  .object({
    client_id: id('Client'),
    license_id: id('Licence'),
    bank_id: id('Bank'),
    transmission_date: isoDate('Date'),
    date_depot: isoDate('Date Depot'),
  })
  .refine((v) => v.date_depot >= v.transmission_date, {
    message: 'Date Depot cannot be before the transmission Date.',
    path: ['date_depot'],
  });
export type TransmissionCreateInput = z.infer<typeof transmissionCreateSchema>;

export const transmissionReadyFilesQuerySchema = z.object({ license_id: id('Licence') });

/** Attach (a file id from /api/v1/files) or detach (null) the bank's acknowledgement. */
export const transmissionArSchema = z.object({
  file_id: z.coerce.number().int().positive().nullable(),
});

export const apuredListQuerySchema = z.object({
  client_id: optionalId,
  q: z.string().trim().max(100).optional(),
});
export type ApuredListQuery = z.infer<typeof apuredListQuerySchema>;
