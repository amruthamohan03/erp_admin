import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import {
  getExportClientOptions,
  getExportLogistics,
  getExportOverview,
  getExportPrepayment,
  getExportTriPhase,
} from '@/db/queries/exportDashboardTabs';
import { exportDashboardTabSchema } from '@/schemas/export-dashboard';

// §4.29 — the Export Tracking dashboard's five tabs.
//
// One route for all five rather than five near-identical files: they share
// their auth, their envelope and their error handling, and the only thing that
// differs is which aggregate to run (§4.10). The tab name is validated against
// the same enum the UI renders its tab strip from, so an unknown tab is a named
// 422 rather than a 404 with nothing to act on (§4.23).
//
// Each tab is its own request because the screen loads them lazily — an
// operator who only opens Overview should not pay for the Prepayment table.

export const GET = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ tab: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { tab: rawTab } = await ctx.params;
    const tab = exportDashboardTabSchema.parse(rawTab);

    switch (tab) {
      case 'overview':
        return ok(await getExportOverview());
      case 'logistics':
        return ok(await getExportLogistics());
      case 'triphase':
        return ok(await getExportTriPhase());
      case 'prepayment':
        return ok(await getExportPrepayment());
      case 'report':
        // The Report tab is only filters and cards; the one thing it needs
        // from the server is which clients actually have export files, so a
        // filter is never offered that finds nothing.
        return ok({ clients: await getExportClientOptions() });
    }
  },
);
