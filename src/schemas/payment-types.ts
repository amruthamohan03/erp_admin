import { z } from 'zod';

export const paymentTypeCreateSchema = z.object({
  payment_type_name: z.string().min(1).max(250),
});
export type PaymentTypeCreateInput = z.infer<typeof paymentTypeCreateSchema>;

export const paymentTypeUpdateSchema = z.object({
  payment_type_name: z.string().min(1).max(250).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type PaymentTypeUpdateInput = z.infer<typeof paymentTypeUpdateSchema>;

export const paymentTypeListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaymentTypeListQuery = z.infer<typeof paymentTypeListQuerySchema>;
