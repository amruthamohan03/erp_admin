import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  itemMaster,
  quotationCategoryMaster,
  type ItemMasterInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { itemUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

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
    .leftJoin(
      quotationCategoryMaster,
      eq(quotationCategoryMaster.id, itemMaster.categoryId),
    )
    .where(eq(itemMaster.id, id))
    .limit(1);

  if (!row) throw new NotFoundError();
  return ok(row);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const data = itemUpdateSchema.parse(await req.json());

  const patch: Partial<ItemMasterInsert> = {};
  if (data.item_name !== undefined) patch.itemName = data.item_name;
  if (data.item_code !== undefined) patch.itemCode = data.item_code;
  if (data.category_id !== undefined) patch.categoryId = data.category_id;
  if (data.tax_not_tax !== undefined) patch.taxNotTax = data.tax_not_tax;
  if (data.percentage !== undefined) patch.percentage = String(data.percentage);
  if (data.item_type !== undefined) patch.itemType = data.item_type;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) {
    throw new BadRequestError('Nothing to update');
  }
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  try {
    const [row] = await db
      .update(itemMaster)
      .set(patch)
      .where(eq(itemMaster.id, id))
      .returning({ id: itemMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  } catch (err: unknown) {
    if (err instanceof NotFoundError) throw err;
    const code = (err as { code?: string }).code;
    if (code === '23503') {
      throw new BadRequestError('Invalid category_id');
    }
    throw err;
  }
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const [row] = await db
    .update(itemMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(itemMaster.id, id))
    .returning({ id: itemMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
