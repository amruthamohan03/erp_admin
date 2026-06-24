import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

// GET /api/v1/clients/dashboard
//
// One round-trip serving the Client Dashboard page. Aggregates,
// monthly registration trend, and per-client consignment activity
// joined from imports_t + exports_t.
//
// Adapted from main's `/api/clients/dashboard` — main's version
// pulled from columns this branch doesn't have (verification
// workflow, contract validity, office_location_id, client_type,
// payment_term). We build the equivalent shape from what
// client_master_t actually supports plus the imports/exports
// FKs that already exist.

interface AggregatesRow {
  total_count: number;
  active_count: number;
  this_month_count: number;
  today_count: number;
  with_email_count: number;
  with_phone_count: number;
  with_tax_id_count: number;
}

interface MonthlyRow {
  month: string;
  n: number;
}

interface ActivityRow {
  client_id: number;
  client_code: string;
  client_name: string;
  import_count: number;
  export_count: number;
  total_fob: number;
  last_activity_at: string | null;
}

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  // Aggregates — single round-trip with subqueries so PG can plan
  // them together and we don't pay N statements for N tiles.
  const aggResult = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM client_master_t) AS total_count,
      (SELECT count(*)::int FROM client_master_t WHERE display = 'Y') AS active_count,
      (
        SELECT count(*)::int FROM client_master_t
        WHERE created_at >= date_trunc('month', current_date)
      ) AS this_month_count,
      (
        SELECT count(*)::int FROM client_master_t
        WHERE created_at >= date_trunc('day', current_date)
      ) AS today_count,
      (
        SELECT count(*)::int FROM client_master_t
        WHERE display = 'Y' AND email IS NOT NULL AND email <> ''
      ) AS with_email_count,
      (
        SELECT count(*)::int FROM client_master_t
        WHERE display = 'Y' AND phone IS NOT NULL AND phone <> ''
      ) AS with_phone_count,
      (
        SELECT count(*)::int FROM client_master_t
        WHERE display = 'Y' AND tax_id IS NOT NULL AND tax_id <> ''
      ) AS with_tax_id_count
  `);
  const agg =
    (aggResult.rows ?? [])[0] as unknown as AggregatesRow | undefined;

  // Monthly registration trend — last 12 months including the
  // current one. Months with zero registrations are surfaced as
  // explicit 0s via the generate_series + LEFT JOIN.
  const monthlyResult = await db.execute(sql`
    WITH months AS (
      SELECT to_char(d, 'YYYY-MM') AS month
      FROM generate_series(
        date_trunc('month', current_date) - interval '11 months',
        date_trunc('month', current_date),
        interval '1 month'
      ) AS d
    )
    SELECT
      m.month,
      COALESCE(c.n, 0)::int AS n
    FROM months m
    LEFT JOIN (
      SELECT to_char(created_at, 'YYYY-MM') AS month, count(*) AS n
      FROM client_master_t
      WHERE created_at >= date_trunc('month', current_date) - interval '11 months'
      GROUP BY 1
    ) c USING (month)
    ORDER BY m.month
  `);
  const monthly = (monthlyResult.rows ?? []) as unknown as MonthlyRow[];

  // Top 10 clients by consignment activity. We UNION imports + exports
  // counts so a client with only one type of consignment still shows
  // up. fob sums imports.fob + exports.fob (same currency assumed at
  // the aggregation layer — per-currency breakdown would belong on
  // a per-client drill-down).
  const activityResult = await db.execute(sql`
    WITH imp AS (
      SELECT client_id, count(*) AS n, COALESCE(SUM(fob), 0) AS fob, MAX(created_at) AS last_at
      FROM imports_t WHERE display = 'Y' AND client_id IS NOT NULL
      GROUP BY client_id
    ),
    exp AS (
      SELECT client_id, count(*) AS n, COALESCE(SUM(fob), 0) AS fob, MAX(created_at) AS last_at
      FROM exports_t WHERE display = 'Y' AND client_id IS NOT NULL
      GROUP BY client_id
    )
    SELECT
      c.id AS client_id,
      c.client_code,
      c.name AS client_name,
      COALESCE(imp.n, 0)::int AS import_count,
      COALESCE(exp.n, 0)::int AS export_count,
      (COALESCE(imp.fob, 0) + COALESCE(exp.fob, 0))::float AS total_fob,
      GREATEST(imp.last_at, exp.last_at) AS last_activity_at
    FROM client_master_t c
    LEFT JOIN imp ON imp.client_id = c.id
    LEFT JOIN exp ON exp.client_id = c.id
    WHERE c.display = 'Y'
      AND (imp.n IS NOT NULL OR exp.n IS NOT NULL)
    ORDER BY (COALESCE(imp.n, 0) + COALESCE(exp.n, 0)) DESC,
             total_fob DESC
    LIMIT 10
  `);
  const activity = (activityResult.rows ?? []) as unknown as ActivityRow[];

  return ok({
    aggregates: {
      total_count: agg?.total_count ?? 0,
      active_count: agg?.active_count ?? 0,
      this_month_count: agg?.this_month_count ?? 0,
      today_count: agg?.today_count ?? 0,
      with_email_count: agg?.with_email_count ?? 0,
      with_phone_count: agg?.with_phone_count ?? 0,
      with_tax_id_count: agg?.with_tax_id_count ?? 0,
    },
    monthly,
    top_activity: activity,
  });
});
