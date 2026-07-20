import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

// GET /api/v1/licenses/stats
// Counts + status breakdown for the licenses module. license_t has
// `state` from the case-runtime workflow — the seeded license
// workflow uses: draft → submitted → approved → issued
// (happy path) plus cancelled as an escape hatch.
//
// Reported buckets:
//   * issued    — the "live" bucket (state='issued')
//   * approved  — approved but not yet issued (state='approved')
//   * pending   — in review or draft (state IN ('draft','submitted'))
//   * cancelled — terminal reject (state='cancelled')
//   * expiring_soon — issued + expiry_date within 30 days

interface TotalsRow {
  total_count: number;
  issued_count: number;
  approved_count: number;
  pending_count: number;
  cancelled_count: number;
  expiring_soon_count: number;
}

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM license_t WHERE display = 'Y') AS total_count,
      (SELECT count(*)::int FROM license_t WHERE display = 'Y' AND state = 'issued') AS issued_count,
      (SELECT count(*)::int FROM license_t WHERE display = 'Y' AND state = 'approved') AS approved_count,
      (SELECT count(*)::int FROM license_t WHERE display = 'Y' AND state IN ('draft', 'submitted')) AS pending_count,
      (SELECT count(*)::int FROM license_t WHERE display = 'Y' AND state = 'cancelled') AS cancelled_count,
      (
        SELECT count(*)::int FROM license_t
        WHERE display = 'Y'
          AND state = 'issued'
          AND expiry_date IS NOT NULL
          AND expiry_date BETWEEN current_date AND current_date + interval '30 days'
      ) AS expiring_soon_count
  `);
  const t = (result.rows ?? [])[0] as unknown as TotalsRow | undefined;

  return ok({
    total_count: t?.total_count ?? 0,
    issued_count: t?.issued_count ?? 0,
    approved_count: t?.approved_count ?? 0,
    pending_count: t?.pending_count ?? 0,
    cancelled_count: t?.cancelled_count ?? 0,
    expiring_soon_count: t?.expiring_soon_count ?? 0,
  });
});
