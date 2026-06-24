import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groupCompanyMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  groupCompanyCreateSchema,
  groupCompanyListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = groupCompanyListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(groupCompanyMaster.display, 'Y'),
        ilike(groupCompanyMaster.groupCompanyName, like),
      )
    : eq(groupCompanyMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(groupCompanyMaster)
    .where(where);

  const items = await db
    .select({
      id: groupCompanyMaster.id,
      group_company_name: groupCompanyMaster.groupCompanyName,
      display: groupCompanyMaster.display,
      created_at: groupCompanyMaster.createdAt,
      updated_at: groupCompanyMaster.updatedAt,
    })
    .from(groupCompanyMaster)
    .where(where)
    .orderBy(desc(groupCompanyMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = groupCompanyCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(groupCompanyMaster)
    .values({
      groupCompanyName: data.group_company_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: groupCompanyMaster.id,
      group_company_name: groupCompanyMaster.groupCompanyName,
      display: groupCompanyMaster.display,
      created_at: groupCompanyMaster.createdAt,
    });

  return ok(row, 201);
});
