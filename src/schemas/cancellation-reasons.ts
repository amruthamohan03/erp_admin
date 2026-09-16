import { z } from 'zod';

// §4.7 — the boundary for the cancellation reason master. Messages name the
// field and the fix (§4.23).

export const cancellationReasonCreateSchema = z.object({
  reason_name: z
    .string()
    .trim()
    .min(1, 'Reason is required.')
    .max(200, 'Reason must be 200 characters or fewer.'),
});
export type CancellationReasonCreateInput = z.infer<typeof cancellationReasonCreateSchema>;

export const cancellationReasonUpdateSchema = z.object({
  reason_name: z
    .string()
    .trim()
    .min(1, 'Reason is required.')
    .max(200, 'Reason must be 200 characters or fewer.')
    .optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type CancellationReasonUpdateInput = z.infer<typeof cancellationReasonUpdateSchema>;

export const cancellationReasonListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type CancellationReasonListQuery = z.infer<typeof cancellationReasonListQuerySchema>;
