import type { NextRequest } from 'next/server';
import { isResponse, ok, requirePermission, withErrorHandler } from '@/lib/api';
import { getSealDashboardTab } from '@/db/queries/sealDashboardTabs';
import { sealDashboardTabSchema } from '@/schemas/seal-dashboard';

// §4.29 — the Seal Tracker dashboard's three tabs. A static `dashboard`
// segment, so it wins over the batch route at /api/v1/seals/[id]. The menu URL
// is the permission resource (§4.7); migration 0143 grants it to every role that
// can view the seal list.

export const GET = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ tab: string }> }) => {
    const session = await requirePermission('/masters/seals/dashboard', 'view');
    if (isResponse(session)) return session;

    const { tab } = await ctx.params;
    return ok(await getSealDashboardTab(sealDashboardTabSchema.parse(tab)));
  },
);
