import { z } from 'zod';
import { SEAL_STATUSES } from '@/lib/seals';

const sealStatusEnum = z.enum(SEAL_STATUSES);

// --- Seal batches (seal_batch_t) -------------------------------------

export const sealBatchCreateSchema = z.object({
  office_location_id: z.coerce.number().int().positive(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  sub_office_code: z.string().max(100).optional().nullable(),
  total_amount: z.coerce.number().positive(),
});
export type SealBatchCreateInput = z.infer<typeof sealBatchCreateSchema>;

export const sealBatchUpdateSchema = z.object({
  office_location_id: z.coerce.number().int().positive().optional(),
  purchase_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional(),
  sub_office_code: z.string().max(100).optional().nullable(),
  total_amount: z.coerce.number().positive().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type SealBatchUpdateInput = z.infer<typeof sealBatchUpdateSchema>;

export const sealBatchListQuerySchema = z.object({
  office_location_id: z.coerce.number().int().positive().optional(),
  /** Filter to batches that have at least one number in this status. */
  status: sealStatusEnum.optional(),
});
export type SealBatchListQuery = z.infer<typeof sealBatchListQuerySchema>;

// --- Seal numbers (seal_number_t) ------------------------------------

export const sealNumbersAddSchema = z.object({
  /**
   * Array of seal numbers to insert under a batch. Duplicates within the
   * payload + collisions with existing rows surface as a clean 409.
   */
  seal_numbers: z.array(z.string().min(1).max(100)).min(1).max(1000),
});
export type SealNumbersAddInput = z.infer<typeof sealNumbersAddSchema>;

export const sealNumberUpdateSchema = z.object({
  status: sealStatusEnum.optional(),
  notes: z.string().optional().nullable(),
  display: z.enum(['Y', 'N']).optional(),
});
export type SealNumberUpdateInput = z.infer<typeof sealNumberUpdateSchema>;

export const sealNumberLookupSchema = z.object({
  seal_number: z.string().min(1).max(100),
});
export type SealNumberLookupInput = z.infer<typeof sealNumberLookupSchema>;

export const sealNumberActionSchema = z.object({
  seal_number_id: z.coerce.number().int().positive(),
  notes: z.string().optional().nullable(),
});
export type SealNumberActionInput = z.infer<typeof sealNumberActionSchema>;

// Bulk lifecycle actions (mark-used / release) accept either an array of
// seal numbers or a string that the handler splits on newlines/commas. The
// latter exists so the UI can paste a column from Excel directly.
export const sealNumberBulkActionSchema = z.object({
  seal_numbers: z.union([z.array(z.string()), z.string()]),
  /** Optional human-readable note recorded on each affected row. */
  reference_info: z.string().max(255).optional(),
});
export type SealNumberBulkActionInput = z.infer<typeof sealNumberBulkActionSchema>;

/**
 * Parse a bulk-action payload into a clean string array. Handles arrays
 * directly + splits string input on newlines/commas. Trims whitespace and
 * drops empty entries. Used by both mark-used and release.
 */
export function parseSealNumberList(raw: string[] | string): string[] {
  const parts = Array.isArray(raw) ? raw : raw.split(/[\r\n,]+/);
  return parts.map((s) => s.trim()).filter(Boolean);
}
