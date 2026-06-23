import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hscodeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { hscodeCreateSchema, hscodeListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = hscodeListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(hscodeMaster.display, 'Y'),
        ilike(hscodeMaster.hscodeNumber, like),
      )
    : eq(hscodeMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(hscodeMaster)
    .where(where);

  const items = await db
    .select({
      id: hscodeMaster.id,
      hscode_number: hscodeMaster.hscodeNumber,
      hscode_ddi: hscodeMaster.hscodeDdi,
      hscode_ica: hscodeMaster.hscodeIca,
      hscode_dci: hscodeMaster.hscodeDci,
      hscode_dcl: hscodeMaster.hscodeDcl,
      hscode_tpi: hscodeMaster.hscodeTpi,
      display: hscodeMaster.display,
      created_at: hscodeMaster.createdAt,
      updated_at: hscodeMaster.updatedAt,
    })
    .from(hscodeMaster)
    .where(where)
    .orderBy(desc(hscodeMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = hscodeCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(hscodeMaster)
    .values({
      hscodeNumber: data.hscode_number,
      hscodeDdi: data.hscode_ddi ?? '0.00',
      hscodeIca: data.hscode_ica ?? '0.00',
      hscodeDci: data.hscode_dci ?? '0.00',
      hscodeDcl: data.hscode_dcl ?? '0.00',
      hscodeTpi: data.hscode_tpi ?? '0.00',
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: hscodeMaster.id,
      hscode_number: hscodeMaster.hscodeNumber,
      display: hscodeMaster.display,
      created_at: hscodeMaster.createdAt,
    });

  return ok(row, 201);
});
