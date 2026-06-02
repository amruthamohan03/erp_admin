import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { masterPageAccordion, type MasterPageAccordionInsert } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [row] = await db
    .select({
      id: masterPageAccordion.id,
      page_id: masterPageAccordion.pageId,
      slug: masterPageAccordion.slug,
      title: masterPageAccordion.title,
      icon: masterPageAccordion.icon,
      display_order: masterPageAccordion.displayOrder,
      display: masterPageAccordion.display,
      created_at: masterPageAccordion.createdAt,
      updated_at: masterPageAccordion.updatedAt,
    })
    .from(masterPageAccordion)
    .where(eq(masterPageAccordion.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  title: z.string().min(1).max(200).optional(),
  icon: z.string().max(100).optional().nullable(),
  display_order: z.coerce.number().int().min(0).optional(),
  display: z.enum(['Y', 'N']).optional(),
});

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const d = parsed.data;

    const patch: Partial<MasterPageAccordionInsert> = {};
    if (d.slug !== undefined) patch.slug = d.slug;
    if (d.title !== undefined) patch.title = d.title;
    if (d.icon !== undefined) patch.icon = d.icon;
    if (d.display_order !== undefined) patch.displayOrder = d.display_order;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(masterPageAccordion)
      .set(patch)
      .where(eq(masterPageAccordion.id, id))
      .returning({ id: masterPageAccordion.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'accordion slug (within this page)');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[master-page-accordions.PUT]', err);
    return fail('Server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [row] = await db
    .update(masterPageAccordion)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(masterPageAccordion.id, id))
    .returning({ id: masterPageAccordion.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
