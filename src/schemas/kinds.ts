import { z } from 'zod';

export const kindCreateSchema = z.object({
  kind_name: z.string().min(1).max(100),
  kind_short_name: z.string().min(1).max(20),
});
export type KindCreateInput = z.infer<typeof kindCreateSchema>;

export const kindUpdateSchema = z.object({
  kind_name: z.string().min(1).max(100).optional(),
  kind_short_name: z.string().min(1).max(20).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type KindUpdateInput = z.infer<typeof kindUpdateSchema>;

export const kindListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type KindListQuery = z.infer<typeof kindListQuerySchema>;
