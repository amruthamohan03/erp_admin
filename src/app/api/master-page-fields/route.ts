import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { masterPageAccordionField } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

const FIELD_TYPES = [
  'text', 'textarea', 'email', 'tel', 'number', 'date', 'select', 'checkbox-group', 'file',
] as const;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const accordionIdRaw = searchParams.get('accordion_id');
  if (!accordionIdRaw) return fail('accordion_id is required', 400);
  const accordionId = Number(accordionIdRaw);
  if (Number.isNaN(accordionId)) return fail('Invalid accordion_id', 400);

  const rows = await db
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
    .where(eq(masterPageAccordionField.accordionId, accordionId))
    .orderBy(asc(masterPageAccordionField.displayOrder), asc(masterPageAccordionField.id));

  return ok(rows);
}

const createSchema = z.object({
  accordion_id: z.coerce.number().int().positive(),
  name: z.string().min(1).max(100).regex(/^[a-z_][a-z0-9_]*$/, 'name must be snake_case (matches DB column)'),
  label: z.string().min(1).max(255),
  field_type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  options_source: z.string().max(100).optional().nullable(),
  options_label_field: z.string().max(100).optional().nullable(),
  options_static: z.unknown().optional().nullable(),
  props: z.unknown().optional().nullable(),
  display_order: z.coerce.number().int().min(0).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const d = parsed.data;

    const [row] = await db
      .insert(masterPageAccordionField)
      .values({
        accordionId: d.accordion_id,
        name: d.name,
        label: d.label,
        fieldType: d.field_type,
        required: d.required ?? false,
        optionsSource: d.options_source ?? null,
        optionsLabelField: d.options_label_field ?? null,
        optionsStatic: d.options_static ?? null,
        props: d.props ?? null,
        displayOrder: d.display_order ?? 1,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({ id: masterPageAccordionField.id });

    return ok({ id: row.id }, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'field name (within this accordion)');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[master-page-fields.POST]', err);
    return fail('Server error', 500);
  }
}
