import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { feetContainerMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  feetContainerCreateSchema,
  feetContainerListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = feetContainerListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(feetContainerMaster.display, 'Y'),
        ilike(feetContainerMaster.feetContainerSize, like),
      )
    : eq(feetContainerMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(feetContainerMaster)
    .where(where);

  const items = await db
    .select({
      id: feetContainerMaster.id,
      feet_container_size: feetContainerMaster.feetContainerSize,
      display: feetContainerMaster.display,
      created_at: feetContainerMaster.createdAt,
      updated_at: feetContainerMaster.updatedAt,
    })
    .from(feetContainerMaster)
    .where(where)
    .orderBy(desc(feetContainerMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = feetContainerCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(feetContainerMaster)
    .values({
      feetContainerSize: data.feet_container_size,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: feetContainerMaster.id,
      feet_container_size: feetContainerMaster.feetContainerSize,
      display: feetContainerMaster.display,
      created_at: feetContainerMaster.createdAt,
    });

  return ok(row, 201);
});
