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

// parent_role_name is the joined name and is only present on read endpoints,
// not on POST returning rows — hence optional.
export const roleResponseSchema = z.object({
  id: z.number().int(),
  role_name: z.string(),
  parent_role_id: z.number().int().nullable(),
  parent_role_name: z.string().nullable().optional(),
  approval_level: z.number().int().nullable(),
  department: z.number().int(),
  management: z.number().int(),
  finance: z.number().int(),
  display: z.enum(['Y', 'N']),
  created_at: z.string().datetime().nullable().optional(),
  updated_at: z.string().datetime().nullable().optional(),
});
export type RoleResponse = z.infer<typeof roleResponseSchema>;
