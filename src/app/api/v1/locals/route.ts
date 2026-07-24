import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { localListQuerySchema } from '@/schemas';
import { listLocals } from '@/db/queries/locals';

// GET /api/v1/locals?q=&location_filter=&page=&pageSize=
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = localListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    location_filter: searchParams.get('location_filter') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;
  const { items, total } = await listLocals(q.location_filter, q.q, q.pageSize, offset);
  return ok(items, { meta: { total, page: q.page, pageSize: q.pageSize } });
});
