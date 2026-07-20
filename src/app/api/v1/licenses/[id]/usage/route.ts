import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT, importT, licenseT } from '@/db/schema';
import {
  ok,
  requireAuth,
  isResponse,
  withErrorHandler,
} from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';

// GET /api/v1/licenses/{id}/usage
//
// Returns how much of a license's FOB cap has been consumed by
// its live exports + imports, plus what's left. Powers the
// /exports/bulk-new grid header ("Available: $X") and can back a
// similar imports/bulk-new page later.
//
// amount is the license's declared FOB ceiling; null amount means
// no cap. remaining_fob is null in that case (UI shows an "∞"
// hint instead of a number).

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const licenseId = parseInt(idStr, 10);
    if (!Number.isInteger(licenseId) || licenseId <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const [lic] = await db
      .select({
        id: licenseT.id,
        license_no: licenseT.licenseNo,
        amount: licenseT.amount,
        client_id: licenseT.clientId,
        state: licenseT.state,
      })
      .from(licenseT)
      .where(eq(licenseT.id, licenseId))
      .limit(1);
    if (!lic) throw new NotFoundError('License not found');

    const [expUsed] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${exportT.fob}), 0)`.as('total'),
      })
      .from(exportT)
      .where(
        and(eq(exportT.licenseId, licenseId), eq(exportT.display, 'Y')),
      );
    const [impUsed] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${importT.fob}), 0)`.as('total'),
      })
      .from(importT)
      .where(
        and(eq(importT.licenseId, licenseId), eq(importT.display, 'Y')),
      );

    const capNum = lic.amount == null ? null : Number(lic.amount);
    const usedExports = Number(expUsed?.total ?? 0);
    const usedImports = Number(impUsed?.total ?? 0);
    const used = usedExports + usedImports;
    const remaining = capNum == null ? null : Math.max(0, capNum - used);

    return ok({
      license_id: lic.id,
      license_no: lic.license_no,
      client_id: lic.client_id,
      state: lic.state,
      amount: capNum,
      used_fob_exports: usedExports,
      used_fob_imports: usedImports,
      used_fob_total: used,
      remaining_fob: remaining,
    });
  },
);
