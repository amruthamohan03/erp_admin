import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { BIVAC_RESOURCE, listBivacClients } from '@/db/queries/bivac';

// GET /api/v1/bivac/clients — clients that own at least one import licence,
// for the Bivac "Filter by Client" dropdown.
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requirePermission(BIVAC_RESOURCE, 'view');
  if (isResponse(session)) return session;
  return ok(await listBivacClients());
});
