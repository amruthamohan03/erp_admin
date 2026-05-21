import { z } from 'zod';

export const userCreateSchema = z.object({
  username: z.string().min(3).max(255),
  password: z.string().min(6).max(100),
  email: z.string().email().max(100),
  full_name: z.string().min(1).max(255),
  mobile: z.string().max(15).optional().nullable(),
  role_id: z.number().int().positive(),
  location_id: z.string().max(100).optional().nullable(),
  dept_id: z.string().max(100).optional().nullable(),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

// Username is intentionally absent — it's immutable post-creation.
export const userUpdateSchema = z.object({
  email: z.string().email().max(100).optional(),
  full_name: z.string().min(1).max(255).optional(),
  mobile: z.string().max(15).optional().nullable(),
  role_id: z.number().int().positive().optional(),
  password: z.string().min(6).max(100).optional(),
  location_id: z.string().max(100).optional().nullable(),
  dept_id: z.string().max(100).optional().nullable(),
  display: z.enum(['Y', 'N']).optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const userListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;
