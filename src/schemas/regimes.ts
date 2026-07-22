import { z } from 'zod';

// Customs regime type — Import / Export / Both, matching main.
const regimeTypeSchema = z.enum(['I', 'E', 'IE']);

export const regimeCreateSchema = z.object({
  regime_name: z.string().min(1).max(200),
  type: regimeTypeSchema,
});
export type RegimeCreateInput = z.infer<typeof regimeCreateSchema>;

export const regimeUpdateSchema = z.object({
  regime_name: z.string().min(1).max(200).optional(),
  type: regimeTypeSchema.optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type RegimeUpdateInput = z.infer<typeof regimeUpdateSchema>;

export const regimeListQuerySchema = z.object({
  q: z.string().optional(),
  type: regimeTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type RegimeListQuery = z.infer<typeof regimeListQuerySchema>;
