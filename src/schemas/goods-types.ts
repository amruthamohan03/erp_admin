import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

export const goodsTypeCreateSchema = z.object({
  goods_type: z.string().min(1).max(100),
  goods_short_name: z.string().min(1).max(20),
  weight_limited: z.boolean().default(true),
  display: z.enum(['Y', 'N']).optional(),
});
export type GoodsTypeCreateInput = z.infer<typeof goodsTypeCreateSchema>;

export const goodsTypeUpdateSchema = z.object({
  goods_type: z.string().min(1).max(100).optional(),
  goods_short_name: z.string().min(1).max(20).optional(),
  weight_limited: z.boolean().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type GoodsTypeUpdateInput = z.infer<typeof goodsTypeUpdateSchema>;

export const goodsTypeListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so every dropdown reading this endpoint still sees only
  // enabled goods types; the master opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type GoodsTypeListQuery = z.infer<typeof goodsTypeListQuerySchema>;
