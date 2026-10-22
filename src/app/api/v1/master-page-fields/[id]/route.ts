import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { masterPageAccordionField, type MasterPageAccordionFieldInsert } from '@/db/schema';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

const FIELD_TYPES = [
  'text', 'textarea', 'email', 'tel', 'number', 'date', 'select', 'checkbox-group', 'file', 'seal-picker',
] as const;

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('The field id in the address is not a number.');

  const [row] = await db
    .select({
      id: masterPageAccordionField.id,
      accordion_id: masterPageAccordionField.accordionId,
      name: masterPageAccordionField.name,
      label: masterPageAccordionField.label,
      field_type: masterPageAccordionField.fieldType,
      required: masterPageAccordionField.required,
      options_source: masterPageAccordionField.optionsSource,
      options_label_field: masterPageAccordionField.optionsLabelField,
      options_static: masterPageAccordionField.optionsStatic,
      props: masterPageAccordionField.props,
      display_order: masterPageAccordionField.displayOrder,
      display: masterPageAccordionField.display,
      created_at: masterPageAccordionField.createdAt,
      updated_at: masterPageAccordionField.updatedAt,
    })
    .from(masterPageAccordionField)
    .where(eq(masterPageAccordionField.id, id));

  if (!row) throw new NotFoundError(`Field #${id} was not found. It may have been deleted — reload the list.`);
  return ok(row);
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z_][a-z0-9_]*$/).optional(),
  label: z.string().min(1).max(255).optional(),
  field_type: z.enum(FIELD_TYPES).optional(),
  required: z.boolean().optional(),
  options_source: z.string().max(100).optional().nullable(),
  options_label_field: z.string().max(100).optional().nullable(),
  options_static: z.unknown().optional().nullable(),
  props: z.unknown().optional().nullable(),
  display_order: z.coerce.number().int().min(0).optional(),
  display: z.enum(['Y', 'N']).optional(),
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('The field id in the address is not a number.');

  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) throw parsed.error;
    const d = parsed.data;

    const patch: Partial<MasterPageAccordionFieldInsert> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.label !== undefined) patch.label = d.label;
    if (d.field_type !== undefined) patch.fieldType = d.field_type;
    if (d.required !== undefined) patch.required = d.required;
    if (d.options_source !== undefined) patch.optionsSource = d.options_source;
    if (d.options_label_field !== undefined) patch.optionsLabelField = d.options_label_field;
    if (d.options_static !== undefined) patch.optionsStatic = d.options_static;
    if (d.props !== undefined) patch.props = d.props;
    if (d.display_order !== undefined) patch.displayOrder = d.display_order;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(masterPageAccordionField)
      .set(patch)
      .where(eq(masterPageAccordionField.id, id))
      .returning({ id: masterPageAccordionField.id });

    if (!row) throw new NotFoundError(`Field #${id} was not found. It may have been deleted — reload the list.`);
    return ok({ id: row.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'field name (within this accordion)');
    if (dup) return dup;
    throw err;
  }
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('The field id in the address is not a number.');

  const [row] = await db
    .update(masterPageAccordionField)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(masterPageAccordionField.id, id))
    .returning({ id: masterPageAccordionField.id });

  if (!row) throw new NotFoundError(`Field #${id} was not found. It may have been deleted — reload the list.`);
  return ok({ id: row.id });
});
