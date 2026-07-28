import { NextRequest } from 'next/server';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { imkpiStageQuerySchema } from '@/schemas';
import { getStageRecords } from '@/db/queries/exkpi';

// GET /api/v1/exkpi/stage-records?stage=&status_filter=&<filters>
// Drill-down: per-record working-days + On Time/Delayed status for one export stage.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = imkpiStageQuerySchema.parse({
    stage: searchParams.get('stage') ?? '',
    status_filter: searchParams.get('status_filter') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    clearance_type: searchParams.get('clearance_type') ?? undefined,
    start_date: searchParams.get('start_date') ?? undefined,
    end_date: searchParams.get('end_date') ?? undefined,
  });

  const result = await getStageRecords(q.stage, q, q.status_filter);
  if (!result) return fail('Invalid stage', 400);
  return ok(result);
});
