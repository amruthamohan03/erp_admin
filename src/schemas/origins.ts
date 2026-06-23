import { z } from 'zod';

export const originCreateSchema = z.object({
  origin_name: z.string().min(1).max(255),
});
export type OriginCreateInput = z.infer<typeof originCreateSchema>;

export const originUpdateSchema = z.object({
  origin_name: z.string().min(1).max(255).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type OriginUpdateInput = z.infer<typeof originUpdateSchema>;

export const originListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OriginListQuery = z.infer<typeof originListQuerySchema>;
