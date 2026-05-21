import { z } from 'zod';

export const roleCreateSchema = z.object({
  role_name: z.string().min(1).max(100),
  parent_role_id: z.number().int().positive().nullable().optional(),
  approval_level: z.number().int().nullable().optional(),
  department: z.number().int().min(0).max(1).default(0),
  management: z.number().int().min(0).max(1).default(0),
  finance: z.number().int().min(0).max(1).default(0),
});
export type RoleCreateInput = z.infer<typeof roleCreateSchema>;

export const roleUpdateSchema = z.object({
  role_name: z.string().min(1).max(100).optional(),
  parent_role_id: z.number().int().positive().nullable().optional(),
  approval_level: z.number().int().nullable().optional(),
  department: z.number().int().min(0).max(1).optional(),
  management: z.number().int().min(0).max(1).optional(),
  finance: z.number().int().min(0).max(1).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;
