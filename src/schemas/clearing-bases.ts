import { z } from 'zod';

export const clearingBasisCreateSchema = z.object({
  clearing_basis_name: z.string().min(1).max(200),
});
export type ClearingBasisCreateInput = z.infer<typeof clearingBasisCreateSchema>;

export const clearingBasisUpdateSchema = z.object({
  clearing_basis_name: z.string().min(1).max(200).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type ClearingBasisUpdateInput = z.infer<typeof clearingBasisUpdateSchema>;

export const clearingBasisListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ClearingBasisListQuery = z.infer<typeof clearingBasisListQuerySchema>;
