import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clearingBasisMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { clearingBasisCreateSchema, clearingBasisListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = clearingBasisListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(eq(clearingBasisMaster.display, 'Y'), ilike(clearingBasisMaster.clearingBasisName, like))
    : eq(clearingBasisMaster.display, 'Y');

  const [countRow] = await db.select({ total: count() }).from(clearingBasisMaster).where(where);

  const items = await db
    .select({
      id: clearingBasisMaster.id,
      clearing_basis_name: clearingBasisMaster.clearingBasisName,
      display: clearingBasisMaster.display,
      created_at: clearingBasisMaster.createdAt,
      updated_at: clearingBasisMaster.updatedAt,
    })
    .from(clearingBasisMaster)
    .where(where)
    .orderBy(desc(clearingBasisMaster.id))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  return ok(items, { meta: { total: countRow.total, page: q.page, pageSize: q.pageSize } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = clearingBasisCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(clearingBasisMaster)
    .values({
      clearingBasisName: data.clearing_basis_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: clearingBasisMaster.id,
      clearing_basis_name: clearingBasisMaster.clearingBasisName,
      display: clearingBasisMaster.display,
      created_at: clearingBasisMaster.createdAt,
    });

  return ok(row, 201);
});
