import { NextRequest } from 'next/server';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { listPartialsForLicense } from '@/db/queries/bivac';

// GET /api/v1/bivac/licenses/{id}/partials — the PARTIELLE rows for one
// licence, each with its used + remaining figures and import-file count.
type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id } = await params;
  const licenseId = Number(id);
  if (!Number.isInteger(licenseId) || licenseId <= 0) {
    return fail('Invalid license id', 400);
  }

  return ok(await listPartialsForLicense(licenseId));
});
