import { z } from 'zod';

export const passwordChangeSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6).max(100),
});
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

export const preferencesUpdateSchema = z.object({
  theme_preference: z.enum(['light', 'dark', 'system']).optional(),
  locale_preference: z.enum(['en', 'fr']).optional(),
  email_notifications: z.boolean().optional(),
  compact_mode: z.boolean().optional(),
});
export type PreferencesUpdateInput = z.infer<typeof preferencesUpdateSchema>;

export const profileUpdateSchema = z.object({
  full_name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(100).optional(),
  mobile: z.string().max(15).nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// GET /me/profile — the full self-profile, used by SettingsView.
export const profileResponseSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  full_name: z.string(),
  email: z.string().email(),
  mobile: z.string().nullable(),
  role_id: z.number().int(),
  role_name: z.string(),
  profile_image: z.string().nullable(),
  signature_image: z.string().nullable(),
  bio: z.string().nullable(),
  theme_preference: z.enum(['light', 'dark', 'system']).nullable(),
  locale_preference: z.enum(['en', 'fr']).nullable(),
  email_notifications: z.enum(['Y', 'N']).nullable(),
  compact_mode: z.enum(['Y', 'N']).nullable(),
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;
