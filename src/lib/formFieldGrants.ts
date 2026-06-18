import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  formFieldRoleGrant,
  type FormFieldRoleGrantRow,
} from '@/db/schema';

// Field-level role grants — overrides what a role can do with one field.
// See [src/db/schema/formFieldRoleGrants.ts] for the schema rationale.
//
// Default ("edit" if no row exists) is documented as the design — handlers
// can treat absence and explicit 'edit' identically.

export type FieldPermission = 'view' | 'edit' | 'hidden';

const DEFAULT_PERMISSION: FieldPermission = 'edit';

/**
 * Effective permission for a single (field, role) lookup. Pure — the lookup
 * map comes from fetchFieldGrants. Default = 'edit' so existing forms keep
 * working when no grants are seeded.
 */
export function effectivePermission(
  grants: ReadonlyMap<number, FieldPermission>,
  fieldId: number,
): FieldPermission {
  return grants.get(fieldId) ?? DEFAULT_PERMISSION;
}

/** True if the role may read this field's value. */
export function canViewField(
  grants: ReadonlyMap<number, FieldPermission>,
  fieldId: number,
): boolean {
  return effectivePermission(grants, fieldId) !== 'hidden';
}

/** True if the role may submit a value for this field. */
export function canEditField(
  grants: ReadonlyMap<number, FieldPermission>,
  fieldId: number,
): boolean {
  return effectivePermission(grants, fieldId) === 'edit';
}

/**
 * Filter a list of field ids to those the role is allowed to write — used by
 * createCase / advanceCase to strip view/hidden fields from incoming payloads
 * BEFORE Zod validation runs, so a hostile client can't sneak writes past
 * the grants by smuggling extra keys.
 */
export function writableFieldIds<T extends { id: number }>(
  fields: ReadonlyArray<T>,
  grants: ReadonlyMap<number, FieldPermission>,
): T[] {
  return fields.filter((f) => canEditField(grants, f.id));
}

/**
 * Filter to fields the role can at least read — used by the form GET endpoint
 * to omit hidden fields from the response entirely.
 */
export function visibleFieldIds<T extends { id: number }>(
  fields: ReadonlyArray<T>,
  grants: ReadonlyMap<number, FieldPermission>,
): T[] {
  return fields.filter((f) => canViewField(grants, f.id));
}

/**
 * Per-field grants for one role, loaded by field id. Returns an empty map
 * when no rows are seeded — every field falls back to DEFAULT_PERMISSION
 * ('edit') without any caller change.
 */
export async function fetchFieldGrants(
  fieldIds: ReadonlyArray<number>,
  roleId: number,
): Promise<Map<number, FieldPermission>> {
  const map = new Map<number, FieldPermission>();
  if (fieldIds.length === 0) return map;

  const rows = await db
    .select({
      fieldId: formFieldRoleGrant.fieldId,
      permission: formFieldRoleGrant.permission,
    })
    .from(formFieldRoleGrant)
    .where(
      and(
        inArray(formFieldRoleGrant.fieldId, [...fieldIds]),
        eq(formFieldRoleGrant.roleId, roleId),
      ),
    );

  for (const r of rows) {
    // The CHECK constraint pins permission to the three known values;
    // narrow without runtime validation.
    map.set(r.fieldId, r.permission as FieldPermission);
  }
  return map;
}

// Re-export the row type so consumers don't import from @/db/schema directly.
export type { FormFieldRoleGrantRow };
