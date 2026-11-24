import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { IMPORT_APUREMENT_RESOURCE, apurementPendingQuerySchema } from '@/schemas';
import { readyLicences } from '@/db/queries/importApurement';

// GET /api/v1/import-apurement/transmissions/ready-licences?client_id= — the
// client's licences with at least one file ready to transmit, and how many.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const q = apurementPendingQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await readyLicences(q.client_id));
});
