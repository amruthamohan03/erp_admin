import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { formDefinitionMaster, formFieldMaster } from '@/db/schema';
import {
  ok,
  requireAuth,
  isResponse,
  withErrorHandler,
} from '@/lib/api';
import { BadRequestError, NotFoundError, ConflictError } from '@/lib/errors';
import { formFieldUpdateSchema } from '@/schemas/forms';

// Per-field PUT / DELETE. Both scope to the parent formKey so a
// stray fieldId that belongs to a different form can't be modified
// via this route (404 instead).

type Ctx = { params: Promise<{ formKey: string; fieldId: string }> };

async function resolveField(formKey: string, fieldIdStr: string) {
  const fieldId = parseInt(fieldIdStr, 10);
  if (!Number.isInteger(fieldId) || fieldId <= 0) {
    throw new BadRequestError('Invalid field id');
  }
  const [def] = await db
    .select({ id: formDefinitionMaster.id })
    .from(formDefinitionMaster)
    .where(eq(formDefinitionMaster.formKey, formKey))
    .limit(1);
  if (!def) throw new NotFoundError('Form definition not found');

  const [field] = await db
    .select({
      id: formFieldMaster.id,
      formId: formFieldMaster.formId,
      fieldKey: formFieldMaster.fieldKey,
    })
    .from(formFieldMaster)
    .where(eq(formFieldMaster.id, fieldId))
    .limit(1);
  if (!field || field.formId !== def.id) {
    throw new NotFoundError('Field not found on this form');
  }
  return { defId: def.id, field };
}

export const PUT = withErrorHandler(
  async (req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { formKey, fieldId } = await params;
    const { defId, field } = await resolveField(formKey, fieldId);
    const data = formFieldUpdateSchema.parse(await req.json());

    // If field_key changes, re-check (formId, field_key) uniqueness.
    if (data.field_key && data.field_key !== field.fieldKey) {
      const [dup] = await db
        .select({ id: formFieldMaster.id })
        .from(formFieldMaster)
        .where(
          and(
            eq(formFieldMaster.formId, defId),
            eq(formFieldMaster.fieldKey, data.field_key),
            eq(formFieldMaster.display, 'Y'),
          ),
        )
        .limit(1);
      if (dup && dup.id !== field.id) {
        throw new ConflictError(
          `field_key "${data.field_key}" already exists on this form`,
        );
      }
    }

    const patch: Record<string, unknown> = {
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };
    if (data.field_key !== undefined) patch.fieldKey = data.field_key;
    if (data.label !== undefined) patch.label = data.label;
    if (data.field_type !== undefined) patch.fieldType = data.field_type;
    if (data.required !== undefined) patch.required = data.required;
    if (data.default_value !== undefined)
      patch.defaultValue = data.default_value;
    if (data.help_text !== undefined) patch.helpText = data.help_text;
    if (data.validation_json !== undefined)
      patch.validationJson = data.validation_json;
    if (data.options_json !== undefined)
      patch.optionsJson = data.options_json;
    if (data.display_order !== undefined)
      patch.displayOrder = data.display_order;

    const [row] = await db
      .update(formFieldMaster)
      .set(patch)
      .where(eq(formFieldMaster.id, field.id))
      .returning({
        id: formFieldMaster.id,
        field_key: formFieldMaster.fieldKey,
        label: formFieldMaster.label,
        field_type: formFieldMaster.fieldType,
        required: formFieldMaster.required,
        display_order: formFieldMaster.displayOrder,
      });

    return ok(row);
  },
);

export const DELETE = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { formKey, fieldId } = await params;
    const { field } = await resolveField(formKey, fieldId);

    const [row] = await db
      .update(formFieldMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(formFieldMaster.id, field.id))
      .returning({ id: formFieldMaster.id });

    return ok({ id: row.id });
  },
);
