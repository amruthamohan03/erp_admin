import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clearingStatusMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  clearingStatusCreateSchema,
  clearingStatusListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = clearingStatusListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(clearingStatusMaster.display, 'Y'),
        ilike(clearingStatusMaster.clearingStatus, like),
      )
    : eq(clearingStatusMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(clearingStatusMaster)
    .where(where);

  const items = await db
    .select({
      id: clearingStatusMaster.id,
      clearing_status: clearingStatusMaster.clearingStatus,
      display: clearingStatusMaster.display,
      created_at: clearingStatusMaster.createdAt,
      updated_at: clearingStatusMaster.updatedAt,
    })
    .from(clearingStatusMaster)
    .where(where)
    .orderBy(desc(clearingStatusMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = clearingStatusCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(clearingStatusMaster)
    .values({
      clearingStatus: data.clearing_status,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: clearingStatusMaster.id,
      clearing_status: clearingStatusMaster.clearingStatus,
      display: clearingStatusMaster.display,
      created_at: clearingStatusMaster.createdAt,
    });

  return ok(row, 201);
});
