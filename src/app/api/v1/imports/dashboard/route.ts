import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import { getImportDashboard } from '@/db/queries/importDashboard';

// §4.29 — Import Tracking dashboard data. Matches the other module dashboards
// (/licenses, /locals, /payments): authenticated, no parameters, everything
// aggregated in SQL.
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await getImportDashboard());
});
