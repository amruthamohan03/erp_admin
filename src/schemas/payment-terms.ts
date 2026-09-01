import { z } from 'zod';

export const paymentTermCreateSchema = z.object({
  payment_term_name: z.string().min(1).max(100),
});
export type PaymentTermCreateInput = z.infer<typeof paymentTermCreateSchema>;

export const paymentTermUpdateSchema = z.object({
  payment_term_name: z.string().min(1).max(100).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type PaymentTermUpdateInput = z.infer<typeof paymentTermUpdateSchema>;

export const paymentTermListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaymentTermListQuery = z.infer<typeof paymentTermListQuerySchema>;
