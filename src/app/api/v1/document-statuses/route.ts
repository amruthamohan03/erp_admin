import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documentStatusMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  documentStatusCreateSchema,
  documentStatusListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = documentStatusListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(documentStatusMaster.display, 'Y')];
  if (q.q?.trim()) {
    conds.push(ilike(documentStatusMaster.documentStatus, `%${q.q.trim()}%`));
  }
  if (q.type) {
    // Substring match — 'I' should match IE/IU/IEU.
    conds.push(ilike(documentStatusMaster.type, `%${q.type}%`));
  }
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(documentStatusMaster)
    .where(where);

  const items = await db
    .select({
      id: documentStatusMaster.id,
      document_status: documentStatusMaster.documentStatus,
      type: documentStatusMaster.type,
      display: documentStatusMaster.display,
      created_at: documentStatusMaster.createdAt,
      updated_at: documentStatusMaster.updatedAt,
    })
    .from(documentStatusMaster)
    .where(where)
    .orderBy(desc(documentStatusMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = documentStatusCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(documentStatusMaster)
    .values({
      documentStatus: data.document_status,
      type: data.type,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: documentStatusMaster.id,
      document_status: documentStatusMaster.documentStatus,
      type: documentStatusMaster.type,
      display: documentStatusMaster.display,
      created_at: documentStatusMaster.createdAt,
    });

  return ok(row, 201);
});
