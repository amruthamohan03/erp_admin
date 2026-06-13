// GET /api/exports/stats — one count per export dashboard card. The /export page
// reads these via each card's data_source path (`/api/exports/stats#<key>`).
// Single pass over exports_t using count(*) FILTER (WHERE ...) per card so the
// numbers always match the ?card= filtered list (same conditions, see
// cardConditions.ts).
import { eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exports } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { EXPORT_CARD_KEYS, cardCondition } from '@/lib/exports/cardConditions';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const projection: Record<string, SQL<number>> = {};
  for (const key of EXPORT_CARD_KEYS) {
    const cond = cardCondition(key);
    projection[key] = cond
      ? sql<number>`cast(count(*) filter (where ${cond}) as int)`
      : sql<number>`cast(count(*) as int)`;
  }

  const [counts] = await db
    .select(projection)
    .from(exports)
    .where(eq(exports.display, 'Y'));

  return ok(counts);
}
