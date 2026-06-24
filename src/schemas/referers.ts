import { z } from 'zod';

export const refererCreateSchema = z.object({
  referer_name: z.string().min(1).max(255),
});
export type RefererCreateInput = z.infer<typeof refererCreateSchema>;

export const refererUpdateSchema = z.object({
  referer_name: z.string().min(1).max(255).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type RefererUpdateInput = z.infer<typeof refererUpdateSchema>;

export const refererListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type RefererListQuery = z.infer<typeof refererListQuerySchema>;
