import { z } from 'zod';

export const goodsTypeCreateSchema = z.object({
  goods_type: z.string().min(1).max(100),
  goods_short_name: z.string().min(1).max(20),
});
export type GoodsTypeCreateInput = z.infer<typeof goodsTypeCreateSchema>;

export const goodsTypeUpdateSchema = z.object({
  goods_type: z.string().min(1).max(100).optional(),
  goods_short_name: z.string().min(1).max(20).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type GoodsTypeUpdateInput = z.infer<typeof goodsTypeUpdateSchema>;

export const goodsTypeListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type GoodsTypeListQuery = z.infer<typeof goodsTypeListQuerySchema>;
