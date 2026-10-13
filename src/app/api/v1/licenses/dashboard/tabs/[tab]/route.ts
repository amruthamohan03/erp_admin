import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import {
  getLicenseClients,
  getLicenseExpiry,
  getLicenseOverview,
} from '@/db/queries/licenseDashboardTabs';
import { licenseDashboardTabSchema, licenseUseForSchema } from '@/schemas/license-dashboard';

// §4.29 — the Licence dashboard's three tabs.
//
// One route for all three rather than three near-identical files: they share
// their auth, their envelope and their error handling, and the only thing that
// differs is which aggregate to run (§4.10). `use_for` scopes the book, so the
// Import and Export Licence dashboards are one implementation.

export const GET = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ tab: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { tab: rawTab } = await ctx.params;
    const tab = licenseDashboardTabSchema.parse(rawTab);
    const { searchParams } = new URL(req.url);
    const useFor = licenseUseForSchema.parse(searchParams.get('use_for') ?? undefined);

    switch (tab) {
      case 'overview':
        return ok(await getLicenseOverview(useFor));
      case 'expiry':
        return ok(await getLicenseExpiry(useFor));
      case 'clients':
        return ok(await getLicenseClients(useFor));
    }
  },
);
