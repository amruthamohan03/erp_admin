import { z } from 'zod';

const roleMenuMappingRow = z.object({
  menu_id: z.number().int().positive(),
  can_view: z.boolean().default(false),
  can_add: z.boolean().default(false),
  can_edit: z.boolean().default(false),
  can_delete: z.boolean().default(false),
  can_approve: z.boolean().default(false),
});

export const roleMenuMappingPutSchema = z.object({
  role_id: z.number().int().positive(),
  mappings: z.array(roleMenuMappingRow),
});
export type RoleMenuMappingPutInput = z.infer<typeof roleMenuMappingPutSchema>;

// GET response shape — every active menu joined with its (possibly absent)
// mapping for the queried role. Missing mapping rows surface as all-false
// permission flags so the UI can render the matrix.
export const roleMenuMappingGetResponseSchema = z.object({
  role_id: z.number().int(),
  menus: z.array(
    z.object({
      menu_id: z.number().int(),
      menu_parent_id: z.number().int().nullable(),
      menu_name: z.string(),
      menu_level: z.number().int().nullable(),
      menu_order: z.number().int(),
      url: z.string().nullable(),
      icon: z.string().nullable(),
      parent_name: z.string().nullable(),
      can_view: z.boolean(),
      can_add: z.boolean(),
      can_edit: z.boolean(),
      can_delete: z.boolean(),
      can_approve: z.boolean(),
    }),
  ),
});
export type RoleMenuMappingGetResponse = z.infer<typeof roleMenuMappingGetResponseSchema>;
