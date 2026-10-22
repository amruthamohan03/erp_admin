import type { NextRequest } from 'next/server';
import { isResponse, ok, requirePermission, withErrorHandler } from '@/lib/api';
import { getFicheDashboardTab } from '@/db/queries/ficheDashboardTabs';
import { ficheDashboardTabSchema } from '@/schemas/fiche-dashboard';

// §4.29 — the Fiche de Calcul dashboard's four tabs. The menu URL is the
// permission resource (§4.7); migration 0143 grants it to every role that can
// view the fiche list.

export const GET = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ tab: string }> }) => {
    const session = await requirePermission('/fiches/dashboard', 'view');
    if (isResponse(session)) return session;

    const { tab } = await ctx.params;
    return ok(await getFicheDashboardTab(ficheDashboardTabSchema.parse(tab)));
  },
);
