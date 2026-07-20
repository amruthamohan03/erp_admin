import { NextRequest } from 'next/server';
import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { formDefinitionMaster } from '@/db/schema';
import {
  ok,
  requireAuth,
  isResponse,
  withErrorHandler,
} from '@/lib/api';
import { ConflictError } from '@/lib/errors';
import { formDefinitionCreateSchema } from '@/schemas/forms';

// GET /api/v1/forms?q=
// List active form definitions for the admin list page. Search
// (optional) hits form_key + name (case-insensitive). Returns
// display fields only; per-field detail hangs off
// /api/v1/forms/{formKey}.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';

  const conds = [eq(formDefinitionMaster.display, 'Y')];
  if (q) {
    const like = `%${q}%`;
    const orClause = or(
      ilike(formDefinitionMaster.formKey, like),
      ilike(formDefinitionMaster.name, like),
    );
    if (orClause) conds.push(orClause);
  }

  const rows = await db
    .select({
      id: formDefinitionMaster.id,
      form_key: formDefinitionMaster.formKey,
      name: formDefinitionMaster.name,
      description: formDefinitionMaster.description,
      entity_type: formDefinitionMaster.entityType,
    })
    .from(formDefinitionMaster)
    .where(and(...conds))
    .orderBy(
      asc(formDefinitionMaster.entityType),
      asc(formDefinitionMaster.name),
    );

  return ok(rows);
});

// POST /api/v1/forms
// Create a new form definition. form_key must be unique among live
// rows — the DB has a plain UNIQUE on form_key (no partial-live
// scope), so a soft-deleted row still blocks reuse. That's fine
// for now: form keys are stable slugs that shouldn't be recycled.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = formDefinitionCreateSchema.parse(await req.json());

  const [existing] = await db
    .select({ id: formDefinitionMaster.id })
    .from(formDefinitionMaster)
    .where(eq(formDefinitionMaster.formKey, data.form_key))
    .limit(1);
  if (existing) {
    throw new ConflictError(`form_key "${data.form_key}" already exists`);
  }

  const [row] = await db
    .insert(formDefinitionMaster)
    .values({
      formKey: data.form_key,
      name: data.name,
      description: data.description ?? null,
      entityType: data.entity_type,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: formDefinitionMaster.id,
      form_key: formDefinitionMaster.formKey,
      name: formDefinitionMaster.name,
      description: formDefinitionMaster.description,
      entity_type: formDefinitionMaster.entityType,
    });

  return ok(row, { status: 201 });
});
