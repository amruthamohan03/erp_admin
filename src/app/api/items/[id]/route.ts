import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { itemMaster, quotationCategoryMaster, type ItemMasterInsert } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

const TAX_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'M', 'O', 'P'] as const;
const ITEM_TYPES = ['I', 'E', 'U', 'IE', 'IU', 'EU', 'IEU'] as const;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [row] = await db
    .select({
      id: itemMaster.id,
      item_name: itemMaster.itemName,
      item_code: itemMaster.itemCode,
      category_id: itemMaster.categoryId,
      category_name: quotationCategoryMaster.categoryName,
      tax_not_tax: itemMaster.taxNotTax,
      percentage: itemMaster.percentage,
      item_type: itemMaster.itemType,
      display: itemMaster.display,
      created_at: itemMaster.createdAt,
      updated_at: itemMaster.updatedAt,
    })
    .from(itemMaster)
    .leftJoin(quotationCategoryMaster, eq(quotationCategoryMaster.id, itemMaster.categoryId))
    .where(eq(itemMaster.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  item_name: z.string().min(1).max(255).optional(),
  item_code: z.string().max(50).optional().nullable(),
  category_id: z.coerce.number().int().positive().optional().nullable(),
  tax_not_tax: z.enum(TAX_CLASSES).optional(),
  percentage: z.coerce.number().min(0).optional(),
  item_type: z.enum(ITEM_TYPES).optional(),
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

    const patch: Partial<ItemMasterInsert> = {};
    if (d.item_name !== undefined) patch.itemName = d.item_name;
    if (d.item_code !== undefined) patch.itemCode = d.item_code;
    if (d.category_id !== undefined) patch.categoryId = d.category_id;
    if (d.tax_not_tax !== undefined) patch.taxNotTax = d.tax_not_tax;
    if (d.percentage !== undefined) patch.percentage = String(d.percentage);
    if (d.item_type !== undefined) patch.itemType = d.item_type;
    if (d.display !== undefined) patch.display = d.display;
    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(itemMaster)
      .set(patch)
      .where(eq(itemMaster.id, id))
      .returning({ id: itemMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[items.PUT]', err);
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
    .update(itemMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(itemMaster.id, id))
    .returning({ id: itemMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
