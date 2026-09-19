import { z } from 'zod';
import { PAYMENT_STAGES, PAYMENT_STAGE_TONES } from '@/db/schema';

// §4.7 — the two Payment Request approval masters' request bodies.

/**
 * One stage's configuration, as Masters → Payment Stages edits it. The slot
 * (`stage`) is not editable — it is which columns the stage writes.
 */
export const paymentStageUpdateSchema = z.object({
  label: z.string().trim().min(1, 'Stage Name is required.').max(60, 'Stage Name must be 60 characters or fewer.'),
  pending_label: z
    .string()
    .trim()
    .min(1, 'Waiting Status is required — it is what a request waiting on this stage shows.')
    .max(60, 'Waiting Status must be 60 characters or fewer.'),
  sort_order: z.coerce.number().int('Order must be a whole number.').min(1, 'Order must be 1 or more.').max(999),
  payment_type: z.enum(['Bank', 'Cash']).nullable(),
  captures_chargeback: z.boolean(),
  requires_cash_collector: z.boolean(),
  captures_documents: z.boolean(),
  print_signature: z.boolean(),
  tone: z.enum(PAYMENT_STAGE_TONES, { errorMap: () => ({ message: 'Choose a badge colour from the list.' }) }),
  display: z.enum(['Y', 'N']),
});
export type PaymentStageUpdate = z.infer<typeof paymentStageUpdateSchema>;

/**
 * Every grant for ONE location scope — `location_id` null is "all locations".
 * The screen sends the whole matrix it shows, and the route replaces that
 * scope's grants with it, so a toggle turned off is removed rather than kept.
 */
export const paymentStageRolePutSchema = z.object({
  location_id: z.coerce.number().int().positive().nullable(),
  grants: z
    .array(
      z.object({
        role_id: z.coerce.number().int().positive(),
        stage: z.enum(PAYMENT_STAGES),
      }),
    )
    .max(5000),
});
export type PaymentStageRolePut = z.infer<typeof paymentStageRolePutSchema>;
