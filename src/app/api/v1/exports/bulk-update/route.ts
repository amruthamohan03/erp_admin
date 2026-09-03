// POST /api/v1/exports/bulk-update
//
// Transactional mass update of the fields the active status filters are about.
// A single validation failure rolls the whole batch back and names the offending
// row (§4.23) — a mass edit that half-applied leaves nobody able to say where it
// stopped. No. of Seals is recomputed from the seal numbers, never submitted.
import { type NextRequest } from 'next/server';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { applyBulkUpdate, BulkUpdateError } from '@/db/queries/exportBulk';
import { bulkUpdateSchema } from '@/schemas/importBulk';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  // Same payload shape as the import bulk update — `{ updates: [{ id, values }] }`,
  // with the server owning the whitelist and the per-type validation. Sharing the
  // schema rather than copying it keeps the two boundaries identical (§4.10).
  const body = bulkUpdateSchema.parse(await req.json());
  try {
    const result = await applyBulkUpdate(body.updates, session.uid);
    return ok(result);
  } catch (e) {
    if (e instanceof BulkUpdateError) return fail(e.message, 422);
    throw e;
  }
});
