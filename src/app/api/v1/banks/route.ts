import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { banklistMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { bankCreateSchema, bankListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = bankListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    for_exchange: searchParams.get('for_exchange') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(banklistMaster.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const orClause = or(
      ilike(banklistMaster.bankName, like),
      ilike(banklistMaster.bankCode, like),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.for_exchange !== undefined) {
    conds.push(eq(banklistMaster.forExchange, q.for_exchange));
  }
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(banklistMaster)
    .where(where);

  const items = await db
    .select({
      id: banklistMaster.id,
      bank_name: banklistMaster.bankName,
      bank_code: banklistMaster.bankCode,
      for_exchange: banklistMaster.forExchange,
      display: banklistMaster.display,
      created_at: banklistMaster.createdAt,
      updated_at: banklistMaster.updatedAt,
    })
    .from(banklistMaster)
    .where(where)
    .orderBy(desc(banklistMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = bankCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(banklistMaster)
    .values({
      bankName: data.bank_name,
      bankCode: data.bank_code,
      forExchange: data.for_exchange ?? 'N',
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: banklistMaster.id,
      bank_name: banklistMaster.bankName,
      bank_code: banklistMaster.bankCode,
      for_exchange: banklistMaster.forExchange,
      display: banklistMaster.display,
      created_at: banklistMaster.createdAt,
    });

  return ok(row, 201);
});
