import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  quotationCategoryMaster,
  type QuotationCategoryMasterInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { quotationCategoryUpdateSchema } from '@/schemas';

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
    .where(eq(quotationCategoryMaster.id, id))
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

  const data = quotationCategoryUpdateSchema.parse(await req.json());

  const patch: Partial<QuotationCategoryMasterInsert> = {};
  if (data.category_name !== undefined) patch.categoryName = data.category_name;
  if (data.category_header !== undefined)
    patch.categoryHeader = data.category_header;
  if (data.display_order !== undefined) patch.displayOrder = data.display_order;
  if (data.is_customs !== undefined) patch.isCustoms = data.is_customs;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) {
    throw new BadRequestError('Nothing to update');
  }
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  const [row] = await db
    .update(quotationCategoryMaster)
    .set(patch)
    .where(eq(quotationCategoryMaster.id, id))
    .returning({ id: quotationCategoryMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
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
    .update(quotationCategoryMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(quotationCategoryMaster.id, id))
    .returning({ id: quotationCategoryMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
