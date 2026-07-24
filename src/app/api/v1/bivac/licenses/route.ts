import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { bivacLicenseListQuerySchema } from '@/schemas';
import { countBivacLicenses, listBivacLicenses } from '@/db/queries/bivac';

// GET /api/v1/bivac/licenses?q=&client_id=&page=&pageSize=
// Import licences (kind 1,2) with PARTIELLE count + used/balance rollups.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = bivacLicenseListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const [total, items] = await Promise.all([
    countBivacLicenses(q.client_id, q.q),
    listBivacLicenses(q.client_id, q.q, q.pageSize, offset),
  ]);

  return ok(items, { meta: { total, page: q.page, pageSize: q.pageSize } });
});
