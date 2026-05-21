import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { roleMenuMapping, menuMaster } from '@/db/schema';
import { AuthPayload } from '@/lib/auth';

// Permission backend per root CLAUDE.md §4.7.
//
// The codebase already stores role-scoped permissions in role_menu_mapping_t
// (role × menu × {can_view, can_add, can_edit, can_delete, can_approve}).
// `resource` is the menu URL (matches menu_master_t.url, e.g. "/masters/users")
// and `action` is one of the five flags. This avoids inventing a duplicate
// master_permission table — see src/modules/masters/CLAUDE.md for the existing
// `_master_t` naming convention.

export type PermissionAction = 'view' | 'add' | 'edit' | 'delete' | 'approve';

export async function checkPermission(
  user: AuthPayload,
  resource: string,
  action: PermissionAction,
): Promise<boolean> {
  const [row] = await db
    .select({
      canView: roleMenuMapping.canView,
      canAdd: roleMenuMapping.canAdd,
      canEdit: roleMenuMapping.canEdit,
      canDelete: roleMenuMapping.canDelete,
      canApprove: roleMenuMapping.canApprove,
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

  if (!row) return false;
  switch (action) {
    case 'view':    return row.canView;
    case 'add':     return row.canAdd;
    case 'edit':    return row.canEdit;
    case 'delete':  return row.canDelete;
    case 'approve': return row.canApprove;
  }
}
