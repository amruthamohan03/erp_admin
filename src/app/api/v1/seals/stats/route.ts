import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

// GET /api/v1/seals/stats
// Totals for the seals dashboard cards: budgeted total (sum of total_seal
// across active batches), actually added (count of seal_number_t rows),
// used, damaged. Plus a per-office breakdown.
//
// Pairs with the dashboard data_source path resolution (commit 51c37c0):
// future cards can point at /api/v1/seals/stats#total_seals,
// /api/v1/seals/stats#used_seals, etc. — one fetch, many cards.

interface TotalsRow {
  total_seals: number;
  added_seals: number;
  used_seals: number;
  damaged_seals: number;
}

interface LocationRow {
  id: number;
  location_name: string;
  seal_count: number;
  added_count: number;
}

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  // Aggregate top-line numbers in one round-trip with sub-selects so the
  // dashboard renders with one query instead of four.
  const totalsResult = await db.execute(sql`
    SELECT
      COALESCE((SELECT SUM(total_seal) FROM seal_batch_t WHERE display = 'Y'), 0)::int AS total_seals,
      (
        SELECT COUNT(*)::int FROM seal_number_t sn
        JOIN seal_batch_t b ON b.id = sn.seal_batch_id
        WHERE b.display = 'Y' AND sn.display = 'Y'
      ) AS added_seals,
      (
        SELECT COUNT(*)::int FROM seal_number_t sn
        JOIN seal_batch_t b ON b.id = sn.seal_batch_id
        WHERE b.display = 'Y' AND sn.display = 'Y' AND sn.status = 'Used'
      ) AS used_seals,
      (
        SELECT COUNT(*)::int FROM seal_number_t sn
        JOIN seal_batch_t b ON b.id = sn.seal_batch_id
        WHERE b.display = 'Y' AND sn.display = 'Y' AND sn.status = 'Damaged'
      ) AS damaged_seals
  `);
  const t = (totalsResult.rows ?? [])[0] as unknown as TotalsRow | undefined;

  const locsResult = await db.execute(sql`
    SELECT
      o.id,
      o.main_location_name AS location_name,
      COALESCE((
        SELECT SUM(b.total_seal) FROM seal_batch_t b
        WHERE b.office_location_id = o.id AND b.display = 'Y'
      ), 0)::int AS seal_count,
      (
        SELECT COUNT(*)::int FROM seal_number_t sn
        JOIN seal_batch_t b ON b.id = sn.seal_batch_id
        WHERE b.office_location_id = o.id
          AND b.display = 'Y'
          AND sn.display = 'Y'
      ) AS added_count
    FROM main_office_master_t o
    WHERE o.display = 'Y'
    ORDER BY o.main_location_name ASC
  `);
  const location_counts = (locsResult.rows ?? []) as unknown as LocationRow[];

  return ok({
    total_seals: t?.total_seals ?? 0,
    added_seals: t?.added_seals ?? 0,
    used_seals: t?.used_seals ?? 0,
    damaged_seals: t?.damaged_seals ?? 0,
    location_counts,
  });
});
