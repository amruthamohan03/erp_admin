import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

// GET /api/v1/exports/stats
// Counts + grand totals for dashboard cards / list header. Mirrors
// imports/stats — `total_count`, sum of `fob` + `weight`, and a
// month-to-date count.
//
// `loading_date` (not `created_at`) drives the month bucket because
// exports use loading as the operational anchor — an export
// pre-alerted in May and loaded in June belongs to June's stats.

interface TotalsRow {
  total_count: number;
  total_fob: number;
  total_weight: number;
  this_month_count: number;
}

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM exports_t WHERE display = 'Y') AS total_count,
      COALESCE((SELECT SUM(fob) FROM exports_t WHERE display = 'Y'), 0)::float AS total_fob,
      COALESCE((SELECT SUM(weight) FROM exports_t WHERE display = 'Y'), 0)::float AS total_weight,
      (
        SELECT count(*)::int FROM exports_t
        WHERE display = 'Y' AND loading_date >= date_trunc('month', current_date)
      ) AS this_month_count
  `);
  const t = (result.rows ?? [])[0] as unknown as TotalsRow | undefined;

  return ok({
    total_count: t?.total_count ?? 0,
    total_fob: t?.total_fob ?? 0,
    total_weight: t?.total_weight ?? 0,
    this_month_count: t?.this_month_count ?? 0,
  });
});
