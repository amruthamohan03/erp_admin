import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';
import { TONE_KEYS, type ToneKey } from '@/lib/statusTone';

// §4.38 — a badge hue from the shared palette, or null for "colour by the
// status's words". The same list the database CHECK holds (migration 0165).
const tone = z
  .enum(TONE_KEYS as [ToneKey, ...ToneKey[]], {
    errorMap: () => ({ message: `Colour must be one of: ${TONE_KEYS.join(', ')}.` }),
  })
  .nullable();

export const clearingStatusCreateSchema = z.object({
  clearing_status: z.string().min(1).max(100),
  tone: tone.optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type ClearingStatusCreateInput = z.infer<typeof clearingStatusCreateSchema>;

export const clearingStatusUpdateSchema = z.object({
  clearing_status: z.string().min(1).max(100).optional(),
  tone: tone.optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type ClearingStatusUpdateInput = z.infer<typeof clearingStatusUpdateSchema>;

export const clearingStatusListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so every dropdown reading this endpoint still sees only
  // enabled rows; the master's own screen opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ClearingStatusListQuery = z.infer<typeof clearingStatusListQuerySchema>;
