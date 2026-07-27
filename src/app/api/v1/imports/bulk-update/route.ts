// POST /api/v1/imports/bulk-update
// Transactional mass update of the fields relevant to the active filters. Any
// single validation failure rolls the whole batch back and names the offending
// row (doc §9.1). Document + clearing status are recomputed per touched row.
import { type NextRequest } from 'next/server';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { applyBulkUpdate, BulkUpdateError } from '@/db/queries/importBulk';
import { bulkUpdateSchema } from '@/schemas/importBulk';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const body = bulkUpdateSchema.parse(await req.json());
  try {
    const result = await applyBulkUpdate(body.updates, session.uid);
    return ok(result);
  } catch (e) {
    if (e instanceof BulkUpdateError) return fail(e.message, 422);
    throw e;
  }
});
