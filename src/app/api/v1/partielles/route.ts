// GET  /api/v1/partielles?license_id= — allotments for a licence, with usage + remaining
// POST /api/v1/partielles — create an allotment (licence-capacity guarded)
import { type NextRequest } from 'next/server';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { listForLicense, createPartielle, PartielleError } from '@/db/queries/partielle';
import { partielleCreateSchema } from '@/schemas/partielle';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const licenseId = Number(req.nextUrl.searchParams.get('license_id'));
  if (!Number.isInteger(licenseId) || licenseId <= 0) return fail('license_id is required', 400);

  return ok(await listForLicense(licenseId));
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const body = partielleCreateSchema.parse(await req.json());
  try {
    const result = await createPartielle(body, session.uid);
    return ok(result, 201);
  } catch (e) {
    if (e instanceof PartielleError) return fail(e.message, 400);
    throw e;
  }
});
