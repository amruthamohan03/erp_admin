import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentMethodMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { paymentMethodCreateSchema, paymentMethodListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = paymentMethodListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    include_disabled: searchParams.get('include_disabled') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = and(
    q.include_disabled ? undefined : eq(paymentMethodMaster.display, 'Y'),
    like ? ilike(paymentMethodMaster.paymentMethodName, like) : undefined,
  );

  const [countRow] = await db.select({ total: count() }).from(paymentMethodMaster).where(where);

  const items = await db
    .select({
      id: paymentMethodMaster.id,
      payment_method_name: paymentMethodMaster.paymentMethodName,
      display: paymentMethodMaster.display,
      created_at: paymentMethodMaster.createdAt,
      updated_at: paymentMethodMaster.updatedAt,
    })
    .from(paymentMethodMaster)
    .where(where)
    .orderBy(desc(paymentMethodMaster.id))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  return ok(items, { meta: { total: countRow.total, page: q.page, pageSize: q.pageSize } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = paymentMethodCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(paymentMethodMaster)
    .values({
      paymentMethodName: data.payment_method_name,
      display: data.display ?? 'Y',
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: paymentMethodMaster.id,
      payment_method_name: paymentMethodMaster.paymentMethodName,
      display: paymentMethodMaster.display,
      created_at: paymentMethodMaster.createdAt,
    });

  return ok(row, 201);
});
