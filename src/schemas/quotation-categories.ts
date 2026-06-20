import { z } from 'zod';

export const quotationCategoryCreateSchema = z.object({
  category_name: z.string().min(1).max(150),
  category_header: z.string().max(255).optional().nullable(),
  display_order: z.coerce.number().int().min(1).default(1),
  is_customs: z.boolean().default(false),
});
export type QuotationCategoryCreateInput = z.infer<
  typeof quotationCategoryCreateSchema
>;

export const quotationCategoryUpdateSchema = z.object({
  category_name: z.string().min(1).max(150).optional(),
  category_header: z.string().max(255).optional().nullable(),
  display_order: z.coerce.number().int().min(1).optional(),
  is_customs: z.boolean().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type QuotationCategoryUpdateInput = z.infer<
  typeof quotationCategoryUpdateSchema
>;

export const quotationCategoryListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type QuotationCategoryListQuery = z.infer<
  typeof quotationCategoryListQuerySchema
>;
