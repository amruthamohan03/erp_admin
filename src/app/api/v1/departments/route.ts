import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { departmentMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  departmentCreateSchema,
  departmentListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = departmentListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    include_disabled: searchParams.get('include_disabled') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = and(
    q.include_disabled ? undefined : eq(departmentMaster.display, 'Y'),
    like ? ilike(departmentMaster.departmentName, like) : undefined,
  );

  const [countRow] = await db
    .select({ total: count() })
    .from(departmentMaster)
    .where(where);

  const items = await db
    .select({
      id: departmentMaster.id,
      department_name: departmentMaster.departmentName,
      display: departmentMaster.display,
      created_at: departmentMaster.createdAt,
      updated_at: departmentMaster.updatedAt,
    })
    .from(departmentMaster)
    .where(where)
    .orderBy(desc(departmentMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = departmentCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(departmentMaster)
    .values({
      departmentName: data.department_name,
      display: data.display ?? 'Y',
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: departmentMaster.id,
      department_name: departmentMaster.departmentName,
      display: departmentMaster.display,
      created_at: departmentMaster.createdAt,
    });

  return ok(row, 201);
});
