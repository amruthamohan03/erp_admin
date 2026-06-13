// GET /api/licenses/stats — one count per license dashboard card. The /license
// page reads these via each card's data_source path (`/api/licenses/stats#<key>`).
// Single pass over licenses_t using count(*) FILTER (WHERE ...) per card so the
// numbers always match the ?card= filtered popup (same conditions, see
// cardConditions.ts).
import { eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { licenses } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { LICENSE_CARD_KEYS, cardCondition } from '@/lib/licenses/cardConditions';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  // Build a { key: count(*) FILTER (WHERE cond) } projection. 'all' has no
  // condition → plain count(*). Cast to int so values come back as numbers.
  const projection: Record<string, SQL<number>> = {};
  for (const key of LICENSE_CARD_KEYS) {
    const cond = cardCondition(key);
    projection[key] = cond
      ? sql<number>`cast(count(*) filter (where ${cond}) as int)`
      : sql<number>`cast(count(*) as int)`;
  }

  const [counts] = await db
    .select(projection)
    .from(licenses)
    .where(eq(licenses.display, 'Y'));

  return ok(counts);
}
