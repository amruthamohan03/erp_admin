import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { imkpiFilterSchema } from '@/schemas';
import { getImkpiAggregate, getFilterOptions, getHolidayRows } from '@/db/queries/imkpi';

// GET /api/v1/imkpi?client_id=&clearance_type=&start_date=&end_date=
// The full KPI payload: summary, priority, stage, bottleneck, client table,
// plus the holiday list and filter dropdown sources.
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
    getImkpiAggregate(f),
    getFilterOptions(),
    getHolidayRows(),
  ]);

  return ok({ ...agg, ...options, drc_holidays: holidays });
});
