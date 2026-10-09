import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import {
  getImportBriefing,
  getImportBorder,
  getImportClientOptions,
  getImportLogistics,
  getImportOffices,
  getImportOverviewExtras,
  getImportReportCounts,
  getImportTriPhase,
} from '@/db/queries/importDashboardTabs';
import {
  importDashboardTabSchema,
  importReportFilterSchema,
} from '@/schemas/import-dashboard';

// §4.29 — the Import Tracking dashboard's analysis tabs.
//
// One route for all seven rather than seven near-identical files: they share
// their auth, their envelope and their error handling, and the only thing that
// differs is which aggregate to run (§4.10). The tab name is validated against
// the same enum the UI renders its tab strip from, so an unknown tab is a named
// 422 rather than a 404 with nothing to act on (§4.23).
//
// Each tab is its own request because the screen loads them lazily — an
// operator who only opens Overview should not pay for the Briefing table, which
// reads every cleared file.

export const GET = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ tab: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { tab: rawTab } = await ctx.params;
    const tab = importDashboardTabSchema.parse(rawTab);
    const { searchParams } = new URL(req.url);

    switch (tab) {
      case 'overview':
        return ok(await getImportOverviewExtras());
      case 'briefing':
        return ok(await getImportBriefing());
      case 'logistics':
        return ok(await getImportLogistics());
      case 'triphase':
        return ok(await getImportTriPhase());
      case 'offices':
        return ok(await getImportOffices());
      case 'border':
        return ok(await getImportBorder());
      case 'reports': {
        const filters = importReportFilterSchema.parse({
          client_id: searchParams.get('client_id') ?? undefined,
          from: searchParams.get('from') ?? undefined,
          to: searchParams.get('to') ?? undefined,
        });
        // The client list ships with the counts: the filter that produced them
        // and the options it offers come from the same request, so a client
        // with no import files is never offered as a filter that finds nothing.
        const [counts, clients] = await Promise.all([
          getImportReportCounts(filters),
          getImportClientOptions(),
        ]);
        return ok({ ...counts, clients });
      }
    }
  },
);
