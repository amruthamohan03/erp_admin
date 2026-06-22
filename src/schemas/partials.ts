import { z } from 'zod';

export const partialCreateSchema = z.object({
  partial_name: z.string().min(1).max(150),
});
export type PartialCreateInput = z.infer<typeof partialCreateSchema>;

export const partialUpdateSchema = z.object({
  partial_name: z.string().min(1).max(150).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type PartialUpdateInput = z.infer<typeof partialUpdateSchema>;

export const partialListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PartialListQuery = z.infer<typeof partialListQuerySchema>;
