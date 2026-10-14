import { z } from 'zod';

// Changing your own password takes the new password alone — the session is the
// proof of identity. "Confirm new password" is a typo guard on the form and
// never reaches the server: it carries no information the server does not
// already have, and accepting it would mean a second place to disagree about
// what the password is.
export const passwordChangeSchema = z.object({
  new_password: z
    .string()
    .min(6, 'New password must be at least 6 characters.')
    .max(100, 'New password must be 100 characters or fewer.'),
});
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

export const preferencesUpdateSchema = z.object({
  theme_preference: z.enum(['light', 'dark', 'system']).optional(),
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
  email_notifications: z.enum(['Y', 'N']).nullable(),
  compact_mode: z.enum(['Y', 'N']).nullable(),
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;
