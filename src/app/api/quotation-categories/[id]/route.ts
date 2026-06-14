import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotationCategoryMaster, type QuotationCategoryInsert } from '@/db/schema';
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
      id: quotationCategoryMaster.id,
      category_name: quotationCategoryMaster.categoryName,
      category_header: quotationCategoryMaster.categoryHeader,
      display_order: quotationCategoryMaster.displayOrder,
      is_customs: quotationCategoryMaster.isCustoms,
      display: quotationCategoryMaster.display,
      created_at: quotationCategoryMaster.createdAt,
      updated_at: quotationCategoryMaster.updatedAt,
    })
    .from(quotationCategoryMaster)
    .where(eq(quotationCategoryMaster.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  category_name: z.string().min(1).max(150).optional(),
  category_header: z.string().max(255).optional().nullable(),
  display_order: z.coerce.number().int().min(0).optional(),
  is_customs: z.boolean().optional(),
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

    const patch: Partial<QuotationCategoryInsert> = {};
    if (d.category_name !== undefined) patch.categoryName = d.category_name;
    if (d.category_header !== undefined) patch.categoryHeader = d.category_header;
    if (d.display_order !== undefined) patch.displayOrder = d.display_order;
    if (d.is_customs !== undefined) patch.isCustoms = d.is_customs;
    if (d.display !== undefined) patch.display = d.display;
    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(quotationCategoryMaster)
      .set(patch)
      .where(eq(quotationCategoryMaster.id, id))
      .returning({ id: quotationCategoryMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'category name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[quotation-categories.PUT]', err);
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
    .update(quotationCategoryMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(quotationCategoryMaster.id, id))
    .returning({ id: quotationCategoryMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
