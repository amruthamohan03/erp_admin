// GET /api/quotations/stats — one count per quotation dashboard card. Single pass
// over quotations_t using count(*) FILTER (WHERE ...) per card so the numbers match
// the ?card= filtered list (same conditions, see cardConditions.ts).
import { eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotations } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { QUOTATION_CARD_KEYS, cardCondition } from '@/lib/quotations/cardConditions';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const projection: Record<string, SQL<number>> = {};
  for (const key of QUOTATION_CARD_KEYS) {
    const cond = cardCondition(key);
    projection[key] = cond
      ? sql<number>`cast(count(*) filter (where ${cond}) as int)`
      : sql<number>`cast(count(*) as int)`;
  }

  const [counts] = await db.select(projection).from(quotations).where(eq(quotations.display, 'Y'));
  return ok(counts);
}
