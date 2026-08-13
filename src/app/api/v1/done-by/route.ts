import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { doneByMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { doneByCreateSchema, doneByListQuerySchema } from '@/schemas';
import { loadBranding } from '@/db/queries/branding';
import { resolveDoneByNames } from '@/lib/doneByLabel';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = doneByListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const branding = await loadBranding();

  const term = q.q?.trim();
  const like = term ? `%${term}%` : null;
  // The company row displays as the project name, so a search for that name has
  // to reach it even though the stored text is something else.
  const matchesProject =
    !!term && branding.project_name.toLowerCase().includes(term.toLowerCase());
  const where = like
    ? and(
        eq(doneByMaster.display, 'Y'),
        matchesProject
          ? or(ilike(doneByMaster.doneByName, like), eq(doneByMaster.isCompany, true))
          : ilike(doneByMaster.doneByName, like),
      )
    : eq(doneByMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(doneByMaster)
    .where(where);

  const rows = await db
    .select({
      id: doneByMaster.id,
      done_by_name: doneByMaster.doneByName,
      is_company: doneByMaster.isCompany,
      display: doneByMaster.display,
      created_at: doneByMaster.createdAt,
      updated_at: doneByMaster.updatedAt,
    })
    .from(doneByMaster)
    .where(where)
    .orderBy(desc(doneByMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  // The company row reads as the configured project name, so every picker built
  // on this endpoint follows a rename automatically.
  const items = resolveDoneByNames(rows, branding.project_name);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = doneByCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(doneByMaster)
    .values({
      doneByName: data.done_by_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: doneByMaster.id,
      done_by_name: doneByMaster.doneByName,
      display: doneByMaster.display,
      created_at: doneByMaster.createdAt,
    });

  return ok(row, 201);
});
