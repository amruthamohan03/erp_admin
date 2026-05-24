import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { typeOfGoodsMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: typeOfGoodsMaster.id,
      goods_type: typeOfGoodsMaster.goodsType,
      goods_short_name: typeOfGoodsMaster.goodsShortName,
      display: typeOfGoodsMaster.display,
      created_at: typeOfGoodsMaster.createdAt,
      updated_at: typeOfGoodsMaster.updatedAt,
      created_by: typeOfGoodsMaster.createdBy,
      updated_by: typeOfGoodsMaster.updatedBy,
    })
    .from(typeOfGoodsMaster)
    .where(eq(typeOfGoodsMaster.display, 'Y'))
    .orderBy(asc(typeOfGoodsMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  goods_type: z.string().min(1).max(100),
  goods_short_name: z.string().min(1).max(20),
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
      .insert(typeOfGoodsMaster)
      .values({
        goodsType: d.goods_type,
        goodsShortName: d.goods_short_name,
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
    // eslint-disable-next-line no-console
    console.error('[type-of-goods.POST]', err);
    return fail('Server error', 500);
  }
}
