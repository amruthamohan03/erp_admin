import { z } from 'zod';

export const departmentCreateSchema = z.object({
  department_name: z.string().min(1).max(100),
});
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;

export const departmentUpdateSchema = z.object({
  department_name: z.string().min(1).max(100).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>;

export const departmentListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DepartmentListQuery = z.infer<typeof departmentListQuerySchema>;
