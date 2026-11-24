import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { IMPORT_APUREMENT_RESOURCE, apurementClientQuerySchema } from '@/schemas';
import { apurementStats } from '@/db/queries/importApurement';

// GET /api/v1/import-apurement/stats?client_id= — the dashboard's four cards,
// counted in SQL over live rows (§4.29).
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_APUREMENT_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const q = apurementClientQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await apurementStats(q.client_id));
});
