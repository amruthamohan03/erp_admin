import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentTermMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { paymentTermCreateSchema, paymentTermListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = paymentTermListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(eq(paymentTermMaster.display, 'Y'), ilike(paymentTermMaster.paymentTermName, like))
    : eq(paymentTermMaster.display, 'Y');

  const [countRow] = await db.select({ total: count() }).from(paymentTermMaster).where(where);

  const items = await db
    .select({
      id: paymentTermMaster.id,
      payment_term_name: paymentTermMaster.paymentTermName,
      display: paymentTermMaster.display,
      created_at: paymentTermMaster.createdAt,
      updated_at: paymentTermMaster.updatedAt,
    })
    .from(paymentTermMaster)
    .where(where)
    .orderBy(desc(paymentTermMaster.id))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  return ok(items, { meta: { total: countRow.total, page: q.page, pageSize: q.pageSize } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = paymentTermCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(paymentTermMaster)
    .values({
      paymentTermName: data.payment_term_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: paymentTermMaster.id,
      payment_term_name: paymentTermMaster.paymentTermName,
      display: paymentTermMaster.display,
      created_at: paymentTermMaster.createdAt,
    });

  return ok(row, 201);
});
