import { z } from 'zod';

export const commodityCreateSchema = z.object({
  commodity_name: z.string().min(1).max(255),
});
export type CommodityCreateInput = z.infer<typeof commodityCreateSchema>;

export const commodityUpdateSchema = z.object({
  commodity_name: z.string().min(1).max(255).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type CommodityUpdateInput = z.infer<typeof commodityUpdateSchema>;

export const commodityListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type CommodityListQuery = z.infer<typeof commodityListQuerySchema>;
