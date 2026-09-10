import { z } from 'zod';

/**
 * A master row id, or nothing.
 *
 * `''` is what a cleared dropdown posts, so it means "no office / no
 * department" rather than a validation failure — §4.23 keeps real messages for
 * real mistakes. Numeric strings are coerced because a `<SearchableSelect>`
 * value is always a string (§4.16).
 */
const masterId = z
  .union([z.coerce.number().int().positive(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));

export const userCreateSchema = z.object({
  username: z.string().min(3).max(255),
  password: z.string().min(6).max(100),
  email: z.string().email().max(100),
  full_name: z.string().min(1).max(255),
  mobile: z.string().max(15).optional().nullable(),
  role_id: z.number().int().positive(),
  location_id: masterId,
  dept_id: masterId,
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

// Username is intentionally absent — it's immutable post-creation.
export const userUpdateSchema = z.object({
  email: z.string().email().max(100).optional(),
  full_name: z.string().min(1).max(255).optional(),
  mobile: z.string().max(15).optional().nullable(),
  role_id: z.number().int().positive().optional(),
  password: z.string().min(6).max(100).optional(),
  location_id: masterId,
  dept_id: masterId,
  /**
   * The account's enable/disable switch, and the same column §4.27's soft
   * delete uses. `login` refuses anyone whose display is not 'Y', so setting
   * 'N' here locks the account out rather than merely hiding the row.
   */
  display: z.enum(['Y', 'N']).optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const userListQuerySchema = z.object({
  q: z.string().optional(),
  /**
   * Which accounts to list. 'active' is the default and preserves the old
   * behaviour; without 'inactive' / 'all' a disabled user was invisible on the
   * only screen that can re-enable them.
   */
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  location_id: z.coerce.number().int().positive().optional(),
  dept_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

// Superset of fields any users endpoint returns. List endpoint omits
// signature_image/location_id/dept_id; detail (/users/{id}) returns them.
// Create returns the trimmed list-style shape. Keeping one schema is simpler
// than three near-duplicates — the optional/nullable fields document the
// variance honestly.
export const userResponseSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  full_name: z.string(),
  email: z.string().email(),
  mobile: z.string().nullable(),
  role_id: z.number().int(),
  role_name: z.string().nullable(),
  profile_image: z.string().nullable(),
  signature_image: z.string().nullable().optional(),
  location_id: z.number().int().nullable().optional(),
  location_name: z.string().nullable().optional(),
  dept_id: z.number().int().nullable().optional(),
  department_name: z.string().nullable().optional(),
  display: z.enum(['Y', 'N']),
  created_at: z.string().datetime().nullable().optional(),
  updated_at: z.string().datetime().nullable().optional(),
});
export type UserResponse = z.infer<typeof userResponseSchema>;
