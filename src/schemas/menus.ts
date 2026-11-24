import { z } from 'zod';

/**
 * A menu URL is the permission resource itself (§4.7): role_menu_mapping_t is
 * matched on it exactly, and routes ask for '/import-apurement', not
 * 'import-apurement'. A path typed without its leading slash therefore grants
 * nothing to anyone — Super Admin included — while still rendering as a working
 * link, which is what made it hard to spot. '#' is a group with no screen.
 */
const menuUrl = z
  .string()
  .trim()
  .max(255, 'URL must be 255 characters or fewer.')
  .refine((v) => v === '' || v === '#' || v.startsWith('/') || /^https?:\/\//u.test(v), {
    message: 'URL must start with "/" (for example /import-apurement), or be # for a group with no screen.',
  })
  .optional()
  .nullable();

export const menuCreateSchema = z.object({
  menu_name: z.string().min(1).max(255),
  url: menuUrl,
  text: z.string().max(100).optional().nullable(),
  icon: z.string().max(100).optional().nullable(),
  badge: z.string().max(50).optional().nullable(),
  menu_id: z.number().int().positive().nullable().optional(),
  menu_order: z.number().int().min(0).default(1),
});
export type MenuCreateInput = z.infer<typeof menuCreateSchema>;

export const menuUpdateSchema = z.object({
  menu_name: z.string().min(1).max(255).optional(),
  url: menuUrl,
  text: z.string().max(100).optional().nullable(),
  icon: z.string().max(100).optional().nullable(),
  badge: z.string().max(50).optional().nullable(),
  menu_id: z.number().int().positive().nullable().optional(),
  menu_order: z.number().int().min(0).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type MenuUpdateInput = z.infer<typeof menuUpdateSchema>;

// Flat menu row. GET /menus returns either an array of these (?flat=1) or a
// tree where each node also carries children: MenuResponse[]. parent_name
// is present on read endpoints (joined) but not on POST returning rows.
export const menuResponseSchema = z.object({
  id: z.number().int(),
  menu_id: z.number().int().nullable(),
  menu_order: z.number().int(),
  menu_level: z.number().int().nullable(),
  menu_name: z.string(),
  url: z.string().nullable(),
  text: z.string().nullable(),
  icon: z.string().nullable(),
  badge: z.string().nullable(),
  display: z.enum(['Y', 'N']),
  parent_name: z.string().nullable().optional(),
});
export type MenuResponse = z.infer<typeof menuResponseSchema>;
