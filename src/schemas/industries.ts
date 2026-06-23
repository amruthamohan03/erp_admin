import { z } from 'zod';

export const industryCreateSchema = z.object({
  industry_name: z.string().min(1).max(200),
});
export type IndustryCreateInput = z.infer<typeof industryCreateSchema>;

export const industryUpdateSchema = z.object({
  industry_name: z.string().min(1).max(200).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type IndustryUpdateInput = z.infer<typeof industryUpdateSchema>;

export const industryListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type IndustryListQuery = z.infer<typeof industryListQuerySchema>;
