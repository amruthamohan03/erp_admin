import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

// A subtype stands on its own — it is not tied to a Payment Method (0144).
// payment_type_id (EXPORT/IMPORT direction) is optional.
export const paymentSubtypeCreateSchema = z.object({
  payment_subtype: z.string().min(1).max(100),
  payment_type_id: z.coerce.number().int().positive().nullable().optional(),
  display: z.enum(['Y', 'N']).optional(),
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
  // Off by default so every dropdown reading this endpoint still sees only
  // enabled rows; the master's own screen opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  payment_type_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaymentSubtypeListQuery = z.infer<
  typeof paymentSubtypeListQuerySchema
>;
