import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

export const groupCompanyCreateSchema = z.object({
  group_company_name: z.string().min(1).max(255),
  display: z.enum(['Y', 'N']).optional(),
});
export type GroupCompanyCreateInput = z.infer<typeof groupCompanyCreateSchema>;

export const groupCompanyUpdateSchema = z.object({
  group_company_name: z.string().min(1).max(255).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type GroupCompanyUpdateInput = z.infer<typeof groupCompanyUpdateSchema>;

export const groupCompanyListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so every dropdown reading this endpoint still sees only
  // enabled group companies; the master opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type GroupCompanyListQuery = z.infer<
  typeof groupCompanyListQuerySchema
>;
