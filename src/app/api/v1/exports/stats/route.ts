import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { exportFilterPredicates } from '@/db/queries/exportFilters';

// GET /api/v1/exports/stats
// One query for every dashboard counter (no per-card table scan): the summary
// totals (total_count / this_month_count / total_fob / total_weight) plus the 17
// status-filter counts, each keyed by its filter key so the list page reads
// `stats[key]` directly. Status predicates come from the shared builder, so the
// cards can never disagree with the grid.
//
// `loading_date` (not `created_at`) drives the month bucket — exports use loading
// as the operational anchor.

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const preds = exportFilterPredicates();
  const statusCounts = Object.entries(preds).map(
    ([key, cond]) => sql`count(*) FILTER (WHERE ${cond})::int AS ${sql.identifier(key)}`,
  );

  const result = await db.execute(sql`
    SELECT
      count(*)::int AS total_count,
      count(*) FILTER (WHERE loading_date >= date_trunc('month', current_date))::int AS this_month_count,
      COALESCE(SUM(fob), 0)::float AS total_fob,
      COALESCE(SUM(weight), 0)::float AS total_weight,
      ${sql.join(statusCounts, sql`, `)}
    FROM ${exportT}
    WHERE display = 'Y'
  `);
  const row = ((result as unknown as { rows: Record<string, number>[] }).rows ?? [])[0] ?? {};

  return ok(row);
});
