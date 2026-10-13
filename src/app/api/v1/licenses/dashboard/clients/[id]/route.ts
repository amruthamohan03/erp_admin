import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import { getLicenseClientDetail } from '@/db/queries/licenseDashboardTabs';
import { licenseUseForSchema } from '@/schemas/license-dashboard';
import { NotFoundError, ValidationError } from '@/lib/errors';

// One client's licence profile, for the Client Analysis tab.
//
// Its own request because the panel is opened for one client at a time — the
// tab would otherwise carry every client's five breakdowns to show one.

export const GET = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id } = await ctx.params;
    const clientId = Number(id);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      throw new ValidationError('That is not a client id.');
    }

    const { searchParams } = new URL(req.url);
    const useFor = licenseUseForSchema.parse(searchParams.get('use_for') ?? undefined);

    const detail = await getLicenseClientDetail(clientId, useFor);
    if (!detail) throw new NotFoundError('That client no longer exists.');
    return ok(detail);
  },
);
