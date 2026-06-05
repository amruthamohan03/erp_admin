// §4.14 — resolve the effective permission of a transactional-page field for a
// role, layering field-level overrides on top of the accordion grant. Shared by
// the page GET (structure) and POST (save) routes so read and write agree.
import { inArray, eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { masterPageAccordionFieldRole } from '@/db/schema';

export type AccordionPerm = 'view' | 'edit';
export type FieldOverride = 'view' | 'edit' | 'hidden';
export type EffectivePerm = 'view' | 'edit' | 'hidden';

const RANK: Record<EffectivePerm, number> = { hidden: 0, view: 1, edit: 2 };

/**
 * Effective permission = the field override clamped to the accordion grant.
 * No override ⇒ inherit the accordion (back-compat). A field can only ever
 * restrict, never elevate above its accordion.
 */
export function effectiveFieldPermission(
  accordionPerm: AccordionPerm,
  override: FieldOverride | undefined,
): EffectivePerm {
  if (!override) return accordionPerm; // inherit
  if (override === 'hidden') return 'hidden';
  return RANK[override] <= RANK[accordionPerm] ? override : accordionPerm;
}

/**
 * Field-role overrides for the given field ids and one role, as a Map
 * field_id → override. Empty Map when no rows (every field inherits).
 */
export async function fetchFieldOverrides(
  fieldIds: number[],
  roleId: number,
): Promise<Map<number, FieldOverride>> {
  const map = new Map<number, FieldOverride>();
  if (fieldIds.length === 0) return map;
  const rows = await db
    .select({
      field_id: masterPageAccordionFieldRole.fieldId,
      permission: masterPageAccordionFieldRole.permission,
    })
    .from(masterPageAccordionFieldRole)
    .where(
      and(
        inArray(masterPageAccordionFieldRole.fieldId, fieldIds),
        eq(masterPageAccordionFieldRole.roleId, roleId),
      ),
    );
  for (const r of rows) map.set(r.field_id, r.permission as FieldOverride);
  return map;
}
