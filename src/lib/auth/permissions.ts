import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { roleMenuMapping, menuMaster } from '@/db/schema';
import { AuthPayload } from '@/lib/auth';

// Permission backend per root CLAUDE.md §4.7.
//
// The codebase stores role-scoped permissions in role_menu_mapping_t
// (role × menu × can_* flags). `resource` is the menu URL (matches
// menu_master_t.url, e.g. "/masters/users") and `action` is one of the flags.
// This avoids inventing a duplicate master_permission table — see
// src/modules/masters/CLAUDE.md for the existing `_master_t` convention.
//
// §4.27 — `delete`, `restore` and `permanentDelete` are deliberately three
// separate actions rather than one "can destroy things" flag. Hiding a record and
// destroying it are different decisions with different consequences, so a role
// that may do the first is not thereby allowed to do the second.

export type PermissionAction =
  | 'view'
  | 'add'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'restore'
  | 'permanentDelete'
  | 'export'
  | 'import'
  | 'print'
  | 'viewAudit'
  | 'exportAudit'
  | 'manageSettings';

/** Column per action — one place to look when adding a flag. */
const COLUMN = {
  view: roleMenuMapping.canView,
  add: roleMenuMapping.canAdd,
  edit: roleMenuMapping.canEdit,
  delete: roleMenuMapping.canDelete,
  approve: roleMenuMapping.canApprove,
  restore: roleMenuMapping.canRestore,
  permanentDelete: roleMenuMapping.canPermanentDelete,
  export: roleMenuMapping.canExport,
  import: roleMenuMapping.canImport,
  print: roleMenuMapping.canPrint,
  viewAudit: roleMenuMapping.canViewAudit,
  exportAudit: roleMenuMapping.canExportAudit,
  manageSettings: roleMenuMapping.canManageSettings,
} as const satisfies Record<PermissionAction, unknown>;

export async function checkPermission(
  user: AuthPayload,
  resource: string,
  action: PermissionAction,
): Promise<boolean> {
  const [row] = await db
    .select({ allowed: COLUMN[action] })
    .from(roleMenuMapping)
    .innerJoin(menuMaster, eq(menuMaster.id, roleMenuMapping.menuId))
    .where(
      and(
        eq(roleMenuMapping.roleId, user.role_id),
        eq(menuMaster.url, resource),
      ),
    )
    .limit(1);

  // No mapping row means the role was never granted this menu at all — denied
  // rather than defaulted, so adding a screen does not silently expose it.
  return row?.allowed ?? false;
}

/**
 * Every flag for one role+menu in a single query — for a UI that needs to decide
 * which buttons to render, rather than asking N times.
 */
export async function permissionsFor(
  user: AuthPayload,
  resource: string,
): Promise<Record<PermissionAction, boolean>> {
  const [row] = await db
    .select({
      view: roleMenuMapping.canView,
      add: roleMenuMapping.canAdd,
      edit: roleMenuMapping.canEdit,
      delete: roleMenuMapping.canDelete,
      approve: roleMenuMapping.canApprove,
      restore: roleMenuMapping.canRestore,
      permanentDelete: roleMenuMapping.canPermanentDelete,
      export: roleMenuMapping.canExport,
      import: roleMenuMapping.canImport,
      print: roleMenuMapping.canPrint,
      viewAudit: roleMenuMapping.canViewAudit,
      exportAudit: roleMenuMapping.canExportAudit,
      manageSettings: roleMenuMapping.canManageSettings,
    })
    .from(roleMenuMapping)
    .innerJoin(menuMaster, eq(menuMaster.id, roleMenuMapping.menuId))
    .where(
      and(
        eq(roleMenuMapping.roleId, user.role_id),
        eq(menuMaster.url, resource),
      ),
    )
    .limit(1);

  const denied = Object.fromEntries(
    (Object.keys(COLUMN) as PermissionAction[]).map((k) => [k, false]),
  ) as Record<PermissionAction, boolean>;

  return row ? { ...denied, ...row } : denied;
}
