import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import { getInvoiceDashboardTab } from '@/db/queries/invoiceDashboardTabs';
import { invoiceDashboardTabSchema } from '@/schemas/invoice-dashboard';

// §4.29 — the Import Invoice dashboard's four tabs. The aggregates are shared
// with the Export Invoice dashboard; this route only fixes the kind.

export const GET = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ tab: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { tab } = await ctx.params;
    return ok(await getInvoiceDashboardTab('import', invoiceDashboardTabSchema.parse(tab)));
  },
);
