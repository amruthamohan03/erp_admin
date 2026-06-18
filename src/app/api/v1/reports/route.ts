import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { listReports } from '@/lib/reports';

// GET /api/v1/reports
// Visible reports for the /reports index page. Display order honoured.

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const reports = await listReports();
  return ok(reports);
});
