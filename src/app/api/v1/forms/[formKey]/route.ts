import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { formDefinitionMaster } from '@/db/schema';
import {
  ok,
  requireAuth,
  isResponse,
  withErrorHandler,
} from '@/lib/api';
import { NotFoundError } from '@/lib/errors';
import { loadForm } from '@/engine/forms';
import {
  fetchFieldGrants,
  annotateVisibleFields,
} from '@/lib/formFieldGrants';
import { formDefinitionUpdateSchema } from '@/schemas/forms';

// Per-form CRUD. GET is dual-purpose:
//   * The runtime DynamicForm renderer calls it and needs the annotated
//     field list (filtered by role grants) so the UI can disable
//     read-only inputs without a second round trip.
//   * The admin editor page needs the same field list (unannotated is
//     fine — the editor is only used by role_id=1 Super Admin who has
//     edit on everything anyway).
// One endpoint, one payload — the annotation is cheap.
//
// PUT / DELETE are admin operations: create / disable definitions.
// Fields are managed via the nested /fields sub-route.

type Ctx = { params: Promise<{ formKey: string }> };

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { formKey } = await params;
    const form = await loadForm(formKey);

    const grants = await fetchFieldGrants(
      form.fields.map((f) => f.id),
      session.role_id,
    );
    const fields = annotateVisibleFields(form.fields, grants);

    return ok({ ...form, fields });
  },
);

export const PUT = withErrorHandler(
  async (req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { formKey } = await params;
    const data = formDefinitionUpdateSchema.parse(await req.json());

    // Build a sparse patch — only keys the client actually sent get
    // updated. Prevents an empty PUT from wiping description/etc.
    const patch: Record<string, unknown> = {
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined)
      patch.description = data.description;
    if (data.entity_type !== undefined) patch.entityType = data.entity_type;

    const [row] = await db
      .update(formDefinitionMaster)
      .set(patch)
      .where(eq(formDefinitionMaster.formKey, formKey))
      .returning({
        id: formDefinitionMaster.id,
        form_key: formDefinitionMaster.formKey,
        name: formDefinitionMaster.name,
        description: formDefinitionMaster.description,
        entity_type: formDefinitionMaster.entityType,
      });

    if (!row) throw new NotFoundError('Form definition not found');
    return ok(row);
  },
);

// DELETE = soft delete (display='N'). Fields remain in place — the
// FK is CASCADE on the field table but we only flip the parent; if
// the definition ever returns (display='Y' again) its fields come
// back with it. Real erase is via a follow-up DB task, not the API.

export const DELETE = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { formKey } = await params;

    const [row] = await db
      .update(formDefinitionMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(formDefinitionMaster.formKey, formKey))
      .returning({ id: formDefinitionMaster.id });

    if (!row) throw new NotFoundError('Form definition not found');
    return ok({ id: row.id });
  },
);
