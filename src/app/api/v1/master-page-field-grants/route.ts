// §4.14 admin API — per-field role overrides for ONE accordion + ONE role.
//
// GET ?accordion_id=N[&role_id=M]
//   → { roles, fields } where each field carries its current override for role M
//     ('view'|'edit'|'hidden'|null). null = inherit the accordion grant.
// PUT ?accordion_id=N&role_id=M  body: { overrides: Record<field_id, 'view'|'edit'|'hidden'|null> }
//   Reconciles in one transaction: non-null upserts, null deletes. Scoped to the
//   accordion's own fields (server-side whitelist) so one accordion can't touch
//   another's grants.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  masterPageAccordionField,
  masterPageAccordionFieldRole,
  roleMaster,
} from '@/db/schema';
import { ok, fail, requireAuth, isResponse } from '@/lib/api';

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const accordionId = Number(searchParams.get('accordion_id'));
  if (Number.isNaN(accordionId)) return fail('accordion_id is required', 400);
  const roleIdRaw = searchParams.get('role_id');
  const roleId = roleIdRaw ? Number(roleIdRaw) : null;
  if (roleIdRaw && Number.isNaN(roleId)) return fail('Invalid role_id', 400);

  const fields = await db
    .select({
      id: masterPageAccordionField.id,
      name: masterPageAccordionField.name,
      label: masterPageAccordionField.label,
      display_order: masterPageAccordionField.displayOrder,
    })
    .from(masterPageAccordionField)
    .where(
      and(
        eq(masterPageAccordionField.accordionId, accordionId),
        eq(masterPageAccordionField.display, 'Y'),
      ),
    )
    .orderBy(asc(masterPageAccordionField.displayOrder), asc(masterPageAccordionField.id));

  const roles = await db
    .select({ id: roleMaster.id, role_name: roleMaster.roleName })
    .from(roleMaster)
    .where(eq(roleMaster.display, 'Y'))
    .orderBy(asc(roleMaster.roleName));

  // Current overrides for the selected role (empty when no role chosen).
  const overrides: Record<number, 'view' | 'edit' | 'hidden'> = {};
  if (roleId && fields.length > 0) {
    const rows = await db
      .select({
        field_id: masterPageAccordionFieldRole.fieldId,
        permission: masterPageAccordionFieldRole.permission,
      })
      .from(masterPageAccordionFieldRole)
      .where(
        and(
          inArray(masterPageAccordionFieldRole.fieldId, fields.map((f) => f.id)),
          eq(masterPageAccordionFieldRole.roleId, roleId),
        ),
      );
    for (const r of rows) overrides[r.field_id] = r.permission as 'view' | 'edit' | 'hidden';
  }

  return ok({
    roles,
    fields: fields.map((f) => ({ ...f, override: overrides[f.id] ?? null })),
  });
}

const putSchema = z.object({
  overrides: z.record(
    z.string(),
    z.union([z.literal('view'), z.literal('edit'), z.literal('hidden'), z.null()]),
  ),
});

export async function PUT(req: NextRequest) {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const accordionId = Number(searchParams.get('accordion_id'));
  const roleId = Number(searchParams.get('role_id'));
  if (Number.isNaN(accordionId)) return fail('accordion_id is required', 400);
  if (Number.isNaN(roleId)) return fail('role_id is required', 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON', 400);
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return fail('Invalid input', 422, { errors: parsed.error.flatten() });

  // Whitelist: only fields that belong to this accordion.
  const fields = await db
    .select({ id: masterPageAccordionField.id })
    .from(masterPageAccordionField)
    .where(eq(masterPageAccordionField.accordionId, accordionId));
  const validFieldIds = new Set(fields.map((f) => f.id));

  type Op = { fieldId: number; permission: 'view' | 'edit' | 'hidden' | null };
  const ops: Op[] = [];
  for (const [key, value] of Object.entries(parsed.data.overrides)) {
    const fieldId = Number(key);
    if (Number.isNaN(fieldId)) return fail(`Invalid field id '${key}'`, 422);
    if (!validFieldIds.has(fieldId)) {
      return fail(`field ${fieldId} does not belong to accordion ${accordionId}`, 422);
    }
    ops.push({ fieldId, permission: value });
  }

  await db.transaction(async (tx) => {
    for (const op of ops) {
      if (op.permission === null) {
        await tx
          .delete(masterPageAccordionFieldRole)
          .where(
            and(
              eq(masterPageAccordionFieldRole.fieldId, op.fieldId),
              eq(masterPageAccordionFieldRole.roleId, roleId),
            ),
          );
      } else {
        await tx
          .insert(masterPageAccordionFieldRole)
          .values({
            fieldId: op.fieldId,
            roleId,
            permission: op.permission,
            createdBy: session.uid,
            updatedBy: session.uid,
          })
          .onConflictDoUpdate({
            target: [masterPageAccordionFieldRole.fieldId, masterPageAccordionFieldRole.roleId],
            set: {
              permission: op.permission,
              updatedBy: session.uid,
              updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
            },
          });
      }
    }
  });

  return ok({ saved: ops.length });
}
