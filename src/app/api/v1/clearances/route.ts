import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clearanceMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  clearanceCreateSchema,
  clearanceListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = clearanceListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(clearanceMaster.display, 'Y'),
        ilike(clearanceMaster.clearanceName, like),
      )
    : eq(clearanceMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(clearanceMaster)
    .where(where);

  const items = await db
    .select({
      id: clearanceMaster.id,
      clearance_name: clearanceMaster.clearanceName,
      display: clearanceMaster.display,
      created_at: clearanceMaster.createdAt,
      updated_at: clearanceMaster.updatedAt,
    })
    .from(clearanceMaster)
    .where(where)
    .orderBy(desc(clearanceMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = clearanceCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(clearanceMaster)
    .values({
      clearanceName: data.clearance_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: clearanceMaster.id,
      clearance_name: clearanceMaster.clearanceName,
      display: clearanceMaster.display,
      created_at: clearanceMaster.createdAt,
    });

  return ok(row, 201);
});
