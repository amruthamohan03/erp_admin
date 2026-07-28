import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { imkpiFilterSchema } from '@/schemas';
import { getExkpiAggregate } from '@/db/queries/exkpi';
import { getFilterOptions, getHolidayRows } from '@/db/queries/imkpi';

// GET /api/v1/exkpi?client_id=&clearance_type=&start_date=&end_date=
// Export Delay KPI payload: summary, priority, stage, bottleneck, client table,
// + holidays and filter dropdown sources (shared with imkpi).
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const f = imkpiFilterSchema.parse({
    client_id: searchParams.get('client_id') ?? undefined,
    clearance_type: searchParams.get('clearance_type') ?? undefined,
    start_date: searchParams.get('start_date') ?? undefined,
    end_date: searchParams.get('end_date') ?? undefined,
  });

  const [agg, options, holidays] = await Promise.all([
    getExkpiAggregate(f),
    getFilterOptions(),
    getHolidayRows(),
  ]);

  return ok({ ...agg, ...options, drc_holidays: holidays });
});
