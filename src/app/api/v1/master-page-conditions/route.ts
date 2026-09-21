// GET /api/v1/master-page-conditions?page_id= — a page's fields and the
// show / hide / required / read-only rules they carry (Transaction Pages →
// Conditions tab).
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { pageIdQuerySchema } from '@/schemas';
import { pageConditionFields } from '@/db/queries/pageConditions';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/masters/pages', 'view');
  if (isResponse(session)) return session;
  const { page_id } = pageIdQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await pageConditionFields(page_id));
});
