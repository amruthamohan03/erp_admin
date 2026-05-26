import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { typeOfGoodsMaster, type TypeOfGoodsMasterInsert } from '@/db/schema';
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
      id: typeOfGoodsMaster.id,
      goods_type: typeOfGoodsMaster.goodsType,
      goods_short_name: typeOfGoodsMaster.goodsShortName,
      display: typeOfGoodsMaster.display,
      created_at: typeOfGoodsMaster.createdAt,
      updated_at: typeOfGoodsMaster.updatedAt,
    })
    .from(typeOfGoodsMaster)
    .where(eq(typeOfGoodsMaster.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  goods_type: z.string().min(1).max(100).optional(),
  goods_short_name: z.string().min(1).max(20).optional(),
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

    const patch: Partial<TypeOfGoodsMasterInsert> = {};
    if (d.goods_type !== undefined) patch.goodsType = d.goods_type;
    if (d.goods_short_name !== undefined) patch.goodsShortName = d.goods_short_name;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(typeOfGoodsMaster)
      .set(patch)
      .where(eq(typeOfGoodsMaster.id, id))
      .returning({ id: typeOfGoodsMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'goods type');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[type-of-goods.PUT]', err);
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
    .update(typeOfGoodsMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(typeOfGoodsMaster.id, id))
    .returning({ id: typeOfGoodsMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
