import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import {
  getQuotationCategories,
  getQuotationClients,
  getQuotationOverview,
  getQuotationValue,
} from '@/db/queries/quotationDashboardTabs';
import { quotationDashboardTabSchema } from '@/schemas/quotation-dashboard';

// §4.29 — the Quotation dashboard's four tabs.
//
// One route for all four rather than four near-identical files: they share
// their auth, their envelope and their error handling, and the only thing that
// differs is which aggregate to run (§4.10).

export const GET = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ tab: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { tab: rawTab } = await ctx.params;
    const tab = quotationDashboardTabSchema.parse(rawTab);

    switch (tab) {
      case 'overview':
        return ok(await getQuotationOverview());
      case 'value':
        return ok(await getQuotationValue());
      case 'categories':
        return ok(await getQuotationCategories());
      case 'clients':
        return ok(await getQuotationClients());
    }
  },
);
