import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

export const commodityCreateSchema = z.object({
  commodity_name: z.string().min(1).max(255),
  display: z.enum(['Y', 'N']).optional(),
});
export type CommodityCreateInput = z.infer<typeof commodityCreateSchema>;

export const commodityUpdateSchema = z.object({
  commodity_name: z.string().min(1).max(255).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type CommodityUpdateInput = z.infer<typeof commodityUpdateSchema>;

export const commodityListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so every dropdown reading this endpoint still sees only
  // enabled rows; the master's own screen opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type CommodityListQuery = z.infer<typeof commodityListQuerySchema>;
