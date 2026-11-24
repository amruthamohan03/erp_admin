import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { IMPORT_APUREMENT_RESOURCE, apurementClientsQuerySchema } from '@/schemas';
import { apurementClients } from '@/db/queries/importApurement';

// GET /api/v1/import-apurement/clients?state=pending|ready — clients with files
// to complete (the pending-grid picker) or to transmit (a new transmission).
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const q = apurementClientsQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await apurementClients(q.state));
});
