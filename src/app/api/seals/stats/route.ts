// GET /api/seals/stats — totals for the seal dashboard cards: total seals
// (sum of total_seal), added (individual rows), used, damaged, plus a per-location
// breakdown (seal_count = sum total_seal, added_count = individual rows).
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const totals = await db.execute(sql`
    SELECT
      COALESCE((SELECT SUM(total_seal) FROM seal_nos_t WHERE display = 'Y'), 0)::int AS total_seals,
      (SELECT COUNT(*) FROM seal_individual_numbers_t sin JOIN seal_nos_t sn ON sn.id = sin.seal_master_id WHERE sn.display = 'Y' AND sin.display = 'Y')::int AS added_seals,
      (SELECT COUNT(*) FROM seal_individual_numbers_t sin JOIN seal_nos_t sn ON sn.id = sin.seal_master_id WHERE sn.display = 'Y' AND sin.display = 'Y' AND sin.status = 'Used')::int AS used_seals,
      (SELECT COUNT(*) FROM seal_individual_numbers_t sin JOIN seal_nos_t sn ON sn.id = sin.seal_master_id WHERE sn.display = 'Y' AND sin.display = 'Y' AND sin.status = 'Damaged')::int AS damaged_seals
  `);
  const t = (totals as unknown as { rows: Record<string, number>[] }).rows[0] ?? {
    total_seals: 0, added_seals: 0, used_seals: 0, damaged_seals: 0,
  };

  const locs = await db.execute(sql`
    SELECT mo.id, mo.main_location_name,
      COALESCE((SELECT SUM(sn.total_seal) FROM seal_nos_t sn WHERE sn.office_location_id = mo.id AND sn.display = 'Y'), 0)::int AS seal_count,
      (SELECT COUNT(*) FROM seal_individual_numbers_t sin JOIN seal_nos_t sn2 ON sn2.id = sin.seal_master_id WHERE sn2.office_location_id = mo.id AND sn2.display = 'Y' AND sin.display = 'Y')::int AS added_count
    FROM main_office_master_t mo
    WHERE mo.display = 'Y'
    ORDER BY mo.main_location_name ASC
  `);
  const location_counts = (locs as unknown as { rows: Record<string, unknown>[] }).rows;

  return ok({
    total_seals: t.total_seals,
    added_seals: t.added_seals,
    used_seals: t.used_seals,
    damaged_seals: t.damaged_seals,
    location_counts,
  });
}
