import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import { getExportDashboard } from '@/db/queries/exportDashboard';

// §4.29 — Export Tracking dashboard data. Mirrors the import dashboard route.
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await getExportDashboard());
});
