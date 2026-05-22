import { z } from 'zod';

export const menuCreateSchema = z.object({
  menu_name: z.string().min(1).max(255),
  url: z.string().max(255).optional().nullable(),
  text: z.string().max(100).optional().nullable(),
  icon: z.string().max(100).optional().nullable(),
  badge: z.string().max(50).optional().nullable(),
  menu_id: z.number().int().positive().nullable().optional(),
  menu_order: z.number().int().min(0).default(1),
});
export type MenuCreateInput = z.infer<typeof menuCreateSchema>;

export const menuUpdateSchema = z.object({
  menu_name: z.string().min(1).max(255).optional(),
  url: z.string().max(255).optional().nullable(),
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
