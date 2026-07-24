import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { listBivacClients } from '@/db/queries/bivac';

// GET /api/v1/bivac/clients — clients that own at least one import licence,
// for the Bivac "Filter by Client" dropdown.
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await listBivacClients());
});
