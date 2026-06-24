import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentTypeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  paymentTypeCreateSchema,
  paymentTypeListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = paymentTypeListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(paymentTypeMaster.display, 'Y'),
        ilike(paymentTypeMaster.paymentTypeName, like),
      )
    : eq(paymentTypeMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(paymentTypeMaster)
    .where(where);

  const items = await db
    .select({
      id: paymentTypeMaster.id,
      payment_type_name: paymentTypeMaster.paymentTypeName,
      display: paymentTypeMaster.display,
      created_at: paymentTypeMaster.createdAt,
      updated_at: paymentTypeMaster.updatedAt,
    })
    .from(paymentTypeMaster)
    .where(where)
    .orderBy(desc(paymentTypeMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = paymentTypeCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(paymentTypeMaster)
    .values({
      paymentTypeName: data.payment_type_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: paymentTypeMaster.id,
      payment_type_name: paymentTypeMaster.paymentTypeName,
      display: paymentTypeMaster.display,
      created_at: paymentTypeMaster.createdAt,
    });

  return ok(row, 201);
});
