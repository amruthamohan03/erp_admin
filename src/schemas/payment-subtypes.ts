import { z } from 'zod';

export const paymentSubtypeCreateSchema = z.object({
  payment_subtype: z.string().min(1).max(100),
  payment_type_id: z.coerce.number().int().positive().nullable().optional(),
});
export type PaymentSubtypeCreateInput = z.infer<
  typeof paymentSubtypeCreateSchema
>;

export const paymentSubtypeUpdateSchema = z.object({
  payment_subtype: z.string().min(1).max(100).optional(),
  payment_type_id: z.coerce.number().int().positive().nullable().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type PaymentSubtypeUpdateInput = z.infer<
  typeof paymentSubtypeUpdateSchema
>;

export const paymentSubtypeListQuerySchema = z.object({
  q: z.string().optional(),
  payment_type_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaymentSubtypeListQuery = z.infer<
  typeof paymentSubtypeListQuerySchema
>;
