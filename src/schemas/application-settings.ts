import { z } from 'zod';

// Boundary schema for /api/v1/application-settings.
//
// PUT is a full replace of the branding row — any field the caller
// omits reverts to its DB default on save. The admin form always
// posts all fields, so this matches the UI contract; API-only
// callers should submit the full object.
//
// Color fields accept `#rrggbb` — 3-digit shorthands are not
// permitted because most UI consumers expand the value verbatim
// into `background-color` / CSS variables where the shorthand
// paints the wrong shade.

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/u, 'Must be a 6-digit hex color (e.g. #2563eb)');

const shortText = (max: number) =>
  z.string().max(max).nullable().optional();

export const applicationSettingsUpdateSchema = z.object({
  project_name: z.string().min(1).max(100),
  app_title: z.string().min(1).max(100),
  tagline: shortText(255),
  logo_url: z.string().max(2000).nullable().optional(),
  favicon_url: z.string().max(2000).nullable().optional(),
  primary_color: hexColor,
  accent_color: hexColor,
  sidebar_bg: hexColor,
  sidebar_fg: hexColor,
  footer_text: z.string().max(2000).nullable().optional(),
});

export type ApplicationSettingsUpdate = z.infer<
  typeof applicationSettingsUpdateSchema
>;
