import { z } from 'zod';

// A subtype belongs to a Payment Method — the licence form lists only the
// subtypes of the method picked (0141), so a new one must name its method.
// payment_type_id (EXPORT/IMPORT direction) stays optional.
export const paymentSubtypeCreateSchema = z.object({
  payment_subtype: z.string().min(1).max(100),
  payment_method_id: z.coerce
    .number({ invalid_type_error: 'Payment Method is required.' })
    .int()
    .positive('Payment Method is required.'),
  payment_type_id: z.coerce.number().int().positive().nullable().optional(),
});
export type PaymentSubtypeCreateInput = z.infer<
  typeof paymentSubtypeCreateSchema
>;

export const paymentSubtypeUpdateSchema = z.object({
  payment_subtype: z.string().min(1).max(100).optional(),
  payment_method_id: z.coerce.number().int().positive().nullable().optional(),
  payment_type_id: z.coerce.number().int().positive().nullable().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type PaymentSubtypeUpdateInput = z.infer<
  typeof paymentSubtypeUpdateSchema
>;

export const paymentSubtypeListQuerySchema = z.object({
  q: z.string().optional(),
  payment_method_id: z.coerce.number().int().positive().optional(),
  payment_type_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaymentSubtypeListQuery = z.infer<
  typeof paymentSubtypeListQuerySchema
>;
