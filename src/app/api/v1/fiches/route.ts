// §2 step 3 — GET /api/v1/fiches?page=&pageSize=&q=&state= — the Fiche de
// Calcul list, server-paged. Create and edit go through the transaction page
// (/api/v1/pages/fiche/{id}); this is the read side.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { ficheListQuerySchema } from '@/schemas';
import { listFiches } from '@/db/queries/fiches';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/fiches', 'view');
  if (isResponse(session)) return session;
  const q = ficheListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const { items, total } = await listFiches(q);
  return ok(items, { meta: { total, page: q.page, pageSize: q.pageSize } });
});
