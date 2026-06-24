import { z } from 'zod';

export const groupCompanyCreateSchema = z.object({
  group_company_name: z.string().min(1).max(255),
});
export type GroupCompanyCreateInput = z.infer<typeof groupCompanyCreateSchema>;

export const groupCompanyUpdateSchema = z.object({
  group_company_name: z.string().min(1).max(255).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type GroupCompanyUpdateInput = z.infer<typeof groupCompanyUpdateSchema>;

export const groupCompanyListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type GroupCompanyListQuery = z.infer<
  typeof groupCompanyListQuerySchema
>;
