import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { formDefinitionMaster, formFieldMaster } from '@/db/schema';
import {
  ok,
  requireAuth,
  isResponse,
  withErrorHandler,
} from '@/lib/api';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { formFieldCreateSchema } from '@/schemas/forms';

// POST /api/v1/forms/{formKey}/fields
// Create a new field on the named form. Enforces (form_id,
// field_key) uniqueness at the app layer — the DB doesn't carry a
// composite unique on formFieldMaster today, and adding one now
// would need a data audit for any stray duplicates.
//
// display_order defaults to (max existing) + 1 so the new field
// lands at the end of the form. Explicit display_order in the body
// wins if supplied.

type Ctx = { params: Promise<{ formKey: string }> };

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { formKey } = await params;
    const data = formFieldCreateSchema.parse(await req.json());

    const [def] = await db
      .select({ id: formDefinitionMaster.id })
      .from(formDefinitionMaster)
      .where(eq(formDefinitionMaster.formKey, formKey))
      .limit(1);
    if (!def) throw new NotFoundError('Form definition not found');

    const [dup] = await db
      .select({ id: formFieldMaster.id })
      .from(formFieldMaster)
      .where(
        and(
          eq(formFieldMaster.formId, def.id),
          eq(formFieldMaster.fieldKey, data.field_key),
          eq(formFieldMaster.display, 'Y'),
        ),
      )
      .limit(1);
    if (dup) {
      throw new ConflictError(
        `field_key "${data.field_key}" already exists on this form`,
      );
    }

    let displayOrder = data.display_order;
    if (displayOrder === undefined) {
      const existing = await db
        .select({ order: formFieldMaster.displayOrder })
        .from(formFieldMaster)
        .where(
          and(
            eq(formFieldMaster.formId, def.id),
            eq(formFieldMaster.display, 'Y'),
          ),
        );
      const max = existing.reduce(
        (m, r) => (r.order > m ? r.order : m),
        -1,
      );
      displayOrder = max + 1;
    }

    const [row] = await db
      .insert(formFieldMaster)
      .values({
        formId: def.id,
        fieldKey: data.field_key,
        label: data.label,
        fieldType: data.field_type,
        required: data.required ?? false,
        defaultValue: data.default_value ?? null,
        helpText: data.help_text ?? null,
        validationJson: data.validation_json ?? null,
        optionsJson: data.options_json ?? null,
        displayOrder,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: formFieldMaster.id,
        field_key: formFieldMaster.fieldKey,
        label: formFieldMaster.label,
        field_type: formFieldMaster.fieldType,
        required: formFieldMaster.required,
        display_order: formFieldMaster.displayOrder,
      });

    return ok(row, { status: 201 });
  },
);
