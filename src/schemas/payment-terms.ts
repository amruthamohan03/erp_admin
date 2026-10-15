import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

export const paymentTermCreateSchema = z.object({
  payment_term_name: z.string().min(1).max(100),
  display: z.enum(['Y', 'N']).optional(),
});
export type PaymentTermCreateInput = z.infer<typeof paymentTermCreateSchema>;

export const paymentTermUpdateSchema = z.object({
  payment_term_name: z.string().min(1).max(100).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type PaymentTermUpdateInput = z.infer<typeof paymentTermUpdateSchema>;

export const paymentTermListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so every dropdown reading this endpoint still sees only
  // enabled rows; the master's own screen opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaymentTermListQuery = z.infer<typeof paymentTermListQuerySchema>;
