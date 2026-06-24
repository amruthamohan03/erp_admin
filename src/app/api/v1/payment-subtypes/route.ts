import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentSubtypeMaster, paymentTypeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  paymentSubtypeCreateSchema,
  paymentSubtypeListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = paymentSubtypeListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    payment_type_id: searchParams.get('payment_type_id') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(paymentSubtypeMaster.display, 'Y')];
  if (q.q?.trim()) {
    conds.push(
      ilike(paymentSubtypeMaster.paymentSubtype, `%${q.q.trim()}%`),
    );
  }
  if (q.payment_type_id) {
    conds.push(eq(paymentSubtypeMaster.paymentTypeId, q.payment_type_id));
  }
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(paymentSubtypeMaster)
    .where(where);

  const items = await db
    .select({
      id: paymentSubtypeMaster.id,
      payment_subtype: paymentSubtypeMaster.paymentSubtype,
      payment_type_id: paymentSubtypeMaster.paymentTypeId,
      payment_type_name: paymentTypeMaster.paymentTypeName,
      display: paymentSubtypeMaster.display,
      created_at: paymentSubtypeMaster.createdAt,
      updated_at: paymentSubtypeMaster.updatedAt,
    })
    .from(paymentSubtypeMaster)
    .leftJoin(
      paymentTypeMaster,
      eq(paymentTypeMaster.id, paymentSubtypeMaster.paymentTypeId),
    )
    .where(where)
    .orderBy(desc(paymentSubtypeMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = paymentSubtypeCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(paymentSubtypeMaster)
    .values({
      paymentSubtype: data.payment_subtype,
      paymentTypeId: data.payment_type_id ?? null,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: paymentSubtypeMaster.id,
      payment_subtype: paymentSubtypeMaster.paymentSubtype,
      payment_type_id: paymentSubtypeMaster.paymentTypeId,
      display: paymentSubtypeMaster.display,
      created_at: paymentSubtypeMaster.createdAt,
    });

  return ok(row, 201);
});
