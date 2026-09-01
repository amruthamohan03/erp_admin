import { z } from 'zod';

export const paymentMethodCreateSchema = z.object({
  payment_method_name: z.string().min(1).max(150),
});
export type PaymentMethodCreateInput = z.infer<typeof paymentMethodCreateSchema>;

export const paymentMethodUpdateSchema = z.object({
  payment_method_name: z.string().min(1).max(150).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type PaymentMethodUpdateInput = z.infer<typeof paymentMethodUpdateSchema>;

export const paymentMethodListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaymentMethodListQuery = z.infer<typeof paymentMethodListQuerySchema>;
