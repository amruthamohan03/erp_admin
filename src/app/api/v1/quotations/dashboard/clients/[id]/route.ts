import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import { getQuotationClientDetail } from '@/db/queries/quotationDashboardTabs';
import { NotFoundError, ValidationError } from '@/lib/errors';

// One client's quotation profile, for the Client Analysis tab.
//
// Its own request because the panel is opened for one client at a time — the
// tab would otherwise carry every client's four breakdowns to show one.

export const GET = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id } = await ctx.params;
    const clientId = Number(id);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      throw new ValidationError('That is not a client id.');
    }

    const detail = await getQuotationClientDetail(clientId);
    if (!detail) throw new NotFoundError('That client no longer exists.');
    return ok(detail);
  },
);
