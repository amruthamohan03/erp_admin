import { NextRequest } from 'next/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  formDefinitionMaster,
  formFieldMaster,
  formFieldRoleGrant,
  roleMaster,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { formFieldGrantsPutSchema } from '@/schemas/form-field-grants';

// GET /api/v1/form-field-grants?form_id=N&role_id=M
// Returns every active field of the form joined with its (possibly absent)
// grant for the queried role. Absent grants surface as permission='edit'
// (the default) so the matrix UI doesn't special-case missing rows.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const formIdParam = searchParams.get('form_id');
  const roleIdParam = searchParams.get('role_id');
  if (!formIdParam) throw new BadRequestError('form_id is required');
  if (!roleIdParam) throw new BadRequestError('role_id is required');
  const formId = Number(formIdParam);
  const roleId = Number(roleIdParam);
  if (!Number.isInteger(formId) || formId <= 0) {
    throw new BadRequestError('form_id must be a positive integer');
  }
  if (!Number.isInteger(roleId) || roleId <= 0) {
    throw new BadRequestError('role_id must be a positive integer');
  }

  const [form] = await db
    .select({
      id: formDefinitionMaster.id,
      formKey: formDefinitionMaster.formKey,
      name: formDefinitionMaster.name,
      entityType: formDefinitionMaster.entityType,
    })
    .from(formDefinitionMaster)
    .where(
      and(
        eq(formDefinitionMaster.id, formId),
        eq(formDefinitionMaster.display, 'Y'),
      ),
    )
    .limit(1);
  if (!form) throw new NotFoundError('Form not found');

  const [role] = await db
    .select({ id: roleMaster.id })
    .from(roleMaster)
    .where(and(eq(roleMaster.id, roleId), eq(roleMaster.display, 'Y')))
    .limit(1);
  if (!role) throw new NotFoundError('Role not found');

  const rows = await db
    .select({
      field_id: formFieldMaster.id,
      field_key: formFieldMaster.fieldKey,
      label: formFieldMaster.label,
      field_type: formFieldMaster.fieldType,
      required: formFieldMaster.required,
      display_order: formFieldMaster.displayOrder,
      permission: formFieldRoleGrant.permission,
    })
    .from(formFieldMaster)
    .leftJoin(
      formFieldRoleGrant,
      and(
        eq(formFieldRoleGrant.fieldId, formFieldMaster.id),
        eq(formFieldRoleGrant.roleId, roleId),
      ),
    )
    .where(
      and(
        eq(formFieldMaster.formId, formId),
        eq(formFieldMaster.display, 'Y'),
      ),
    )
    .orderBy(asc(formFieldMaster.displayOrder), asc(formFieldMaster.id));

  const fields = rows.map((r) => ({
    field_id: r.field_id,
    field_key: r.field_key,
    label: r.label,
    field_type: r.field_type,
    required: r.required,
    display_order: r.display_order,
    permission: (r.permission ?? 'edit') as 'view' | 'edit' | 'hidden',
  }));

  return ok({ form_id: formId, role_id: roleId, form, fields });
});

// PUT /api/v1/form-field-grants
// Bulk save for one (form, role). edit-permission rows are DELETED rather
// than upserted (absence = default = edit) so the grants table stays clean.

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { form_id, role_id, grants } = formFieldGrantsPutSchema.parse(
    await req.json(),
  );

  // Validate the parents before any mutation so we return a clean 404 instead
  // of a confusing FK violation on the upsert.
  const [form] = await db
    .select({ id: formDefinitionMaster.id })
    .from(formDefinitionMaster)
    .where(eq(formDefinitionMaster.id, form_id))
    .limit(1);
  if (!form) throw new NotFoundError('Form not found');
  const [role] = await db
    .select({ id: roleMaster.id })
    .from(roleMaster)
    .where(eq(roleMaster.id, role_id))
    .limit(1);
  if (!role) throw new NotFoundError('Role not found');

  // Reject submissions referencing fields that don't belong to this form —
  // catches stale UIs after a field was deleted, and prevents a hostile
  // client from crafting grants against unrelated forms' fields via the
  // (field_id, role_id) uniqueness.
  const fieldIds = grants.map((g) => g.field_id);
  if (fieldIds.length > 0) {
    const validFields = await db
      .select({ id: formFieldMaster.id })
      .from(formFieldMaster)
      .where(
        and(
          eq(formFieldMaster.formId, form_id),
          inArray(formFieldMaster.id, fieldIds),
        ),
      );
    if (validFields.length !== fieldIds.length) {
      throw new BadRequestError(
        'One or more field_id values do not belong to this form',
      );
    }
  }

  const toDelete = grants
    .filter((g) => g.permission === 'edit')
    .map((g) => g.field_id);
  const toUpsert = grants.filter((g) => g.permission !== 'edit');

  await db.transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx
        .delete(formFieldRoleGrant)
        .where(
          and(
            eq(formFieldRoleGrant.roleId, role_id),
            inArray(formFieldRoleGrant.fieldId, toDelete),
          ),
        );
    }
    if (toUpsert.length === 0) return;

    const values = toUpsert.map((g) => ({
      fieldId: g.field_id,
      roleId: role_id,
      permission: g.permission,
      createdBy: session.uid,
      updatedBy: session.uid,
    }));
    await tx
      .insert(formFieldRoleGrant)
      .values(values)
      .onConflictDoUpdate({
        target: [formFieldRoleGrant.fieldId, formFieldRoleGrant.roleId],
        set: {
          permission: sql`excluded.permission`,
          updatedBy: session.uid,
          updatedAt: sql`now()`,
        },
      });
  });

  return ok({
    form_id,
    role_id,
    upserted: toUpsert.length,
    cleared: toDelete.length,
  });
});
