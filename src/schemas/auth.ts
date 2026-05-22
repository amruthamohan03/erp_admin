import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Returned by POST /api/v1/auth/login and GET /api/v1/auth/me with overlap;
// /me carries a few extra fields (mobile, profile_image, display).
export const loginResponseSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  full_name: z.string(),
  email: z.string().email(),
  role_id: z.number().int(),
  role_name: z.string(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const meResponseSchema = loginResponseSchema.extend({
  mobile: z.string().nullable(),
  profile_image: z.string().nullable(),
  display: z.enum(['Y', 'N']),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
