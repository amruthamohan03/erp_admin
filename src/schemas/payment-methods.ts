import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

export const paymentMethodCreateSchema = z.object({
  payment_method_name: z.string().min(1).max(150),
  display: z.enum(['Y', 'N']).optional(),
});
export type PaymentMethodCreateInput = z.infer<typeof paymentMethodCreateSchema>;

export const paymentMethodUpdateSchema = z.object({
  payment_method_name: z.string().min(1).max(150).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type PaymentMethodUpdateInput = z.infer<typeof paymentMethodUpdateSchema>;

export const paymentMethodListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so every dropdown reading this endpoint still sees only
  // enabled rows; the master's own screen opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaymentMethodListQuery = z.infer<typeof paymentMethodListQuerySchema>;
