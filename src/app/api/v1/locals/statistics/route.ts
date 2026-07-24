import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { getLocalStatistics } from '@/db/queries/locals';

// GET /api/v1/locals/statistics — total + per-office file counts (list cards).
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await getLocalStatistics());
});
