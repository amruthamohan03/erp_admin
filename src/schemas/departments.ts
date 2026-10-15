import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

export const departmentCreateSchema = z.object({
  department_name: z.string().min(1).max(100),
  display: z.enum(['Y', 'N']).optional(),
});
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;

export const departmentUpdateSchema = z.object({
  department_name: z.string().min(1).max(100).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>;

export const departmentListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so every dropdown reading this endpoint still sees only
  // enabled rows; the master's own screen opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DepartmentListQuery = z.infer<typeof departmentListQuerySchema>;
