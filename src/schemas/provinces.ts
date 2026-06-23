import { z } from 'zod';

export const provinceCreateSchema = z.object({
  province_name: z.string().min(1).max(255),
  origin_id: z.coerce.number().int().positive().nullable().optional(),
});
export type ProvinceCreateInput = z.infer<typeof provinceCreateSchema>;

export const provinceUpdateSchema = z.object({
  province_name: z.string().min(1).max(255).optional(),
  origin_id: z.coerce.number().int().positive().nullable().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type ProvinceUpdateInput = z.infer<typeof provinceUpdateSchema>;

export const provinceListQuerySchema = z.object({
  q: z.string().optional(),
  origin_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ProvinceListQuery = z.infer<typeof provinceListQuerySchema>;
