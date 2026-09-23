import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { getClientDashboard } from '@/db/queries/clientDashboard';

// GET /api/v1/clients/activity?client_id=123
//
// §4.29 — one client's operational picture: open files, licence headroom,
// outstanding payments and recent movement, all aggregated in SQL.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const raw = req.nextUrl.searchParams.get('client_id');
  const clientId = Number(raw);
  // §4.23 — name the parameter and what it should be, not "Bad request".
  if (!raw || !Number.isInteger(clientId) || clientId <= 0) {
    throw new BadRequestError('Client is required — pass client_id as a positive whole number.');
  }

  return ok(await getClientDashboard(clientId));
});
