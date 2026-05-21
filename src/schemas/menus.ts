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
