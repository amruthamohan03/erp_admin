import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  typeOfGoodsMaster,
  type TypeOfGoodsMasterInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { goodsTypeUpdateSchema } from '@/schemas';

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
      id: typeOfGoodsMaster.id,
      goods_type: typeOfGoodsMaster.goodsType,
      goods_short_name: typeOfGoodsMaster.goodsShortName,
      weight_limited: typeOfGoodsMaster.weightLimited,
      display: typeOfGoodsMaster.display,
      created_at: typeOfGoodsMaster.createdAt,
      updated_at: typeOfGoodsMaster.updatedAt,
    })
    .from(typeOfGoodsMaster)
    .where(eq(typeOfGoodsMaster.id, id))
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

  const data = goodsTypeUpdateSchema.parse(await req.json());

  const patch: Partial<TypeOfGoodsMasterInsert> = {};
  if (data.goods_type !== undefined) patch.goodsType = data.goods_type;
  if (data.goods_short_name !== undefined)
    patch.goodsShortName = data.goods_short_name;
  if (data.weight_limited !== undefined) patch.weightLimited = data.weight_limited;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) {
    throw new BadRequestError('Nothing to update');
  }
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  let row: { id: number } | undefined;
  try {
    [row] = await db
      .update(typeOfGoodsMaster)
      .set(patch)
      .where(eq(typeOfGoodsMaster.id, id))
      .returning({ id: typeOfGoodsMaster.id });
  } catch (err) {
    // Same guard as the create path (0091): renaming a goods type onto another
    // one's name must say so rather than surfacing a bare constraint name.
    const dup = uniqueViolationResponse(err, {
      type_of_goods_master_t_type_uq: 'Type',
      type_of_goods_master_t_short_name_uq: 'Short Name',
      default: 'Type',
    });
    if (dup) return dup;
    throw err;
  }

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
    .update(typeOfGoodsMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(typeOfGoodsMaster.id, id))
    .returning({ id: typeOfGoodsMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
