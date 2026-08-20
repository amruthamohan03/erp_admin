import { z } from 'zod';

// §4.14 — the permission flags a role can hold on a menu.
//
// Declared ONCE, here, and derived everywhere else: the Zod row shape, the API's
// grant/revoke predicates, and the matrix UI's columns all read from this list.
// Before, each of those spelled the five flags out by hand, so adding one meant
// remembering three places — and a flag missed in the grant predicate silently
// fails to save.
export const PERMISSION_FLAGS = [
  { key: 'can_view', label: 'View' },
  { key: 'can_add', label: 'Add' },
  { key: 'can_edit', label: 'Edit' },
  { key: 'can_delete', label: 'Delete' },
  { key: 'can_restore', label: 'Restore' },
  { key: 'can_permanent_delete', label: 'Perm. Delete' },
  { key: 'can_approve', label: 'Approve' },
  { key: 'can_export', label: 'Export' },
  { key: 'can_import', label: 'Import' },
  { key: 'can_print', label: 'Print' },
  { key: 'can_view_audit', label: 'View Audit' },
  { key: 'can_export_audit', label: 'Export Audit' },
  { key: 'can_manage_settings', label: 'Settings' },
] as const;

export type PermissionFlagKey = (typeof PERMISSION_FLAGS)[number]['key'];

export const PERMISSION_FLAG_KEYS = PERMISSION_FLAGS.map((f) => f.key) as readonly PermissionFlagKey[];

/** `{ can_view: z.boolean().default(false), … }` for every flag. */
const flagShape = Object.fromEntries(
  PERMISSION_FLAG_KEYS.map((k) => [k, z.boolean().default(false)]),
) as Record<PermissionFlagKey, z.ZodDefault<z.ZodBoolean>>;

const roleMenuMappingRow = z.object({
  menu_id: z.number().int().positive(),
  ...flagShape,
});

export const roleMenuMappingPutSchema = z.object({
  role_id: z.number().int().positive(),
  mappings: z.array(roleMenuMappingRow),
});
export type RoleMenuMappingPutInput = z.infer<typeof roleMenuMappingPutSchema>;

/** True when a row grants nothing — such rows are deleted rather than stored. */
export function grantsNothing(row: Record<string, unknown>): boolean {
  return PERMISSION_FLAG_KEYS.every((k) => !row[k]);
}

// GET response shape — every active menu joined with its (possibly absent)
// mapping for the queried role. Missing mapping rows surface as all-false
// permission flags so the UI can render the matrix.
const responseFlagShape = Object.fromEntries(
  PERMISSION_FLAG_KEYS.map((k) => [k, z.boolean()]),
) as Record<PermissionFlagKey, z.ZodBoolean>;

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
      ...responseFlagShape,
    }),
  ),
});
export type RoleMenuMappingGetResponse = z.infer<typeof roleMenuMappingGetResponseSchema>;
