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
