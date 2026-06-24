import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { phaseMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { phaseCreateSchema, phaseListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = phaseListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(phaseMaster.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const orClause = or(
      ilike(phaseMaster.phaseName, like),
      ilike(phaseMaster.phaseCode, like),
    );
    if (orClause) conds.push(orClause);
  }
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(phaseMaster)
    .where(where);

  const items = await db
    .select({
      id: phaseMaster.id,
      phase_name: phaseMaster.phaseName,
      phase_code: phaseMaster.phaseCode,
      display: phaseMaster.display,
      created_at: phaseMaster.createdAt,
      updated_at: phaseMaster.updatedAt,
    })
    .from(phaseMaster)
    .where(where)
    .orderBy(desc(phaseMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = phaseCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(phaseMaster)
    .values({
      phaseName: data.phase_name,
      phaseCode: data.phase_code,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: phaseMaster.id,
      phase_name: phaseMaster.phaseName,
      phase_code: phaseMaster.phaseCode,
      display: phaseMaster.display,
      created_at: phaseMaster.createdAt,
    });

  return ok(row, 201);
});
