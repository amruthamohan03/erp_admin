import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import { getDelayTracker } from '@/db/queries/delayTracker';
import { delayTrackerQuerySchema } from '@/schemas/delay-tracker';

// GET /api/v1/delay-tracker
//
// Every tracked file measured against its rule. What "late" means is
// `delay_rule_master_t` (§4.1); this route only chooses the scope.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = delayTrackerQuerySchema.parse({
    module: searchParams.get('module') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    include_completed: searchParams.get('include_completed') ?? undefined,
  });

  return ok(await getDelayTracker(q));
});
