import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { typeOfGoodsMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';
import {
  goodsTypeCreateSchema,
  goodsTypeListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = goodsTypeListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(typeOfGoodsMaster.display, 'Y'),
        or(
          ilike(typeOfGoodsMaster.goodsType, like),
          ilike(typeOfGoodsMaster.goodsShortName, like),
        ),
      )
    : eq(typeOfGoodsMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(typeOfGoodsMaster)
    .where(where);

  const items = await db
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
    .where(where)
    .orderBy(desc(typeOfGoodsMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = goodsTypeCreateSchema.parse(await req.json());
  try {
    const [row] = await db
      .insert(typeOfGoodsMaster)
      .values({
        goodsType: data.goods_type,
        goodsShortName: data.goods_short_name,
        weightLimited: data.weight_limited,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: typeOfGoodsMaster.id,
        goods_type: typeOfGoodsMaster.goodsType,
        goods_short_name: typeOfGoodsMaster.goodsShortName,
        display: typeOfGoodsMaster.display,
        created_at: typeOfGoodsMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    // Type is the unique field (0091 — 0085 had put it on Short Name, which is
    // not the field the form's live badge checks). Without this the operator
    // gets the generic handler's "Resource already exists", which names neither
    // the field nor the value (§4.23).
    const dup = uniqueViolationResponse(err, {
      type_of_goods_master_t_type_uq: 'Type',
      type_of_goods_master_t_short_name_uq: 'Short Name',
      default: 'Type',
    });
    if (dup) return dup;
    throw err;
  }
});
