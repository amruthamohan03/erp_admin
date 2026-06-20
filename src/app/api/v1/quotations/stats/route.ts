import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

// GET /api/v1/quotations/stats
// Counts + grand totals for the dashboard cards. Pairs with the
// data_source path resolution (51c37c0): future cards can point at
// /api/v1/quotations/stats#total_count, #total_usd, etc.

interface TotalsRow {
  total_count: number;
  total_usd: number;
  total_cdf: number;
  this_month_count: number;
}

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM quotations_t WHERE display = 'Y') AS total_count,
      COALESCE((SELECT SUM(total_amount) FROM quotations_t WHERE display = 'Y'), 0)::float AS total_usd,
      COALESCE((SELECT SUM(total_amount_cdf) FROM quotations_t WHERE display = 'Y'), 0)::float AS total_cdf,
      (
        SELECT count(*)::int FROM quotations_t
        WHERE display = 'Y' AND created_at >= date_trunc('month', current_date)
      ) AS this_month_count
  `);
  const t = (result.rows ?? [])[0] as unknown as TotalsRow | undefined;

  return ok({
    total_count: t?.total_count ?? 0,
    total_usd: t?.total_usd ?? 0,
    total_cdf: t?.total_cdf ?? 0,
    this_month_count: t?.this_month_count ?? 0,
  });
});
