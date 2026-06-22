import { z } from 'zod';

export const regimeCreateSchema = z.object({
  regime_name: z.string().min(1).max(200),
  type: z.string().length(2),
});
export type RegimeCreateInput = z.infer<typeof regimeCreateSchema>;

export const regimeUpdateSchema = z.object({
  regime_name: z.string().min(1).max(200).optional(),
  type: z.string().length(2).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type RegimeUpdateInput = z.infer<typeof regimeUpdateSchema>;

export const regimeListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type RegimeListQuery = z.infer<typeof regimeListQuerySchema>;
