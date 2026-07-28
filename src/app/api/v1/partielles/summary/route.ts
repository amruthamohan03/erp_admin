// GET /api/v1/partielles/summary?license_id= — everything the PARTIELLE
// Management modal renders: licence weight/FOB budget, remaining (available)
// budget, and the allotment rows with usage + file counts.
import { type NextRequest } from 'next/server';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { partielleSummary } from '@/db/queries/partielle';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const licenseId = Number(req.nextUrl.searchParams.get('license_id'));
  if (!Number.isInteger(licenseId) || licenseId <= 0) return fail('license_id is required', 400);

  const summary = await partielleSummary(licenseId);
  if (!summary) return fail('Licence not found', 404);
  return ok(summary);
});
