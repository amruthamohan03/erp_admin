import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { subOfficeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  subOfficeCreateSchema,
  subOfficeListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = subOfficeListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(subOfficeMaster.display, 'Y'),
        ilike(subOfficeMaster.subOfficeName, like),
      )
    : eq(subOfficeMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(subOfficeMaster)
    .where(where);

  const items = await db
    .select({
      id: subOfficeMaster.id,
      sub_office_name: subOfficeMaster.subOfficeName,
      display: subOfficeMaster.display,
      created_at: subOfficeMaster.createdAt,
      updated_at: subOfficeMaster.updatedAt,
    })
    .from(subOfficeMaster)
    .where(where)
    .orderBy(desc(subOfficeMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = subOfficeCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(subOfficeMaster)
    .values({
      subOfficeName: data.sub_office_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: subOfficeMaster.id,
      sub_office_name: subOfficeMaster.subOfficeName,
      display: subOfficeMaster.display,
      created_at: subOfficeMaster.createdAt,
    });

  return ok(row, 201);
});
