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
