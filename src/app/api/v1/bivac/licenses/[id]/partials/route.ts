import { NextRequest } from 'next/server';
import { ok, fail, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { BIVAC_RESOURCE } from '@/db/queries/bivac';
import { listForLicense } from '@/db/queries/partielle';

// GET /api/v1/bivac/licenses/{id}/partials — the licence's PARTIELLE allotments
// (the same rows Import Tracking creates), each with its usage, remaining
// balance and file count.
type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(BIVAC_RESOURCE, 'view');
  if (isResponse(session)) return session;

  const { id } = await params;
  const licenseId = Number(id);
  if (!Number.isInteger(licenseId) || licenseId <= 0) {
    return fail(`"${id}" is not a valid licence id.`, 400);
  }

  return ok(await listForLicense(licenseId));
});
