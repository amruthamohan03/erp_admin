import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

// GET /api/v1/licenses/stats
// Counts + status breakdown for the licenses module. License_t has
// `state` from the case-runtime workflow (not a clearing_status),
// so we surface counts by state (active / approved / pending /
// closed) rather than a single this-month total.

interface TotalsRow {
  total_count: number;
  active_count: number;
  approved_count: number;
  pending_count: number;
  closed_count: number;
  expiring_soon_count: number;
}

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM license_t WHERE display = 'Y') AS total_count,
      (SELECT count(*)::int FROM license_t WHERE display = 'Y' AND state = 'active') AS active_count,
      (SELECT count(*)::int FROM license_t WHERE display = 'Y' AND state = 'approved') AS approved_count,
      (SELECT count(*)::int FROM license_t WHERE display = 'Y' AND state IN ('draft', 'pending_approval')) AS pending_count,
      (SELECT count(*)::int FROM license_t WHERE display = 'Y' AND state IN ('closed', 'rejected', 'expired')) AS closed_count,
      (
        SELECT count(*)::int FROM license_t
        WHERE display = 'Y'
          AND expiry_date IS NOT NULL
          AND expiry_date BETWEEN current_date AND current_date + interval '30 days'
      ) AS expiring_soon_count
  `);
  const t = (result.rows ?? [])[0] as unknown as TotalsRow | undefined;

  return ok({
    total_count: t?.total_count ?? 0,
    active_count: t?.active_count ?? 0,
    approved_count: t?.approved_count ?? 0,
    pending_count: t?.pending_count ?? 0,
    closed_count: t?.closed_count ?? 0,
    expiring_soon_count: t?.expiring_soon_count ?? 0,
  });
});
