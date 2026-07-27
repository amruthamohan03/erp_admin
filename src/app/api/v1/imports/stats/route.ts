import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importT } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { importFilterPredicates } from '@/db/queries/importFilters';

// GET /api/v1/imports/stats
// One query for every dashboard counter (the doc's P-01 fix — no more fourteen
// separate table scans). Returns the summary tiles (total / this_month /
// total_fob / total_weight) plus the 13 status-filter counts, each keyed by the
// dashboard-card `card_content_id` so the list page reads `stats[key]` directly.
// The status predicates come from the shared builder, so the cards can never
// disagree with the grid (C-01).

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const preds = importFilterPredicates();
  const statusCounts = Object.entries(preds).map(
    ([key, cond]) => sql`count(*) FILTER (WHERE ${cond})::int AS ${sql.identifier(key)}`,
  );

  const result = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE created_at >= date_trunc('month', current_date))::int AS this_month,
      COALESCE(SUM(fob), 0)::float AS total_fob,
      COALESCE(SUM(weight), 0)::float AS total_weight,
      ${sql.join(statusCounts, sql`, `)}
    FROM ${importT}
    WHERE display = 'Y'
  `);
  const row = ((result as unknown as { rows: Record<string, number>[] }).rows ?? [])[0] ?? {};

  return ok(row);
});
