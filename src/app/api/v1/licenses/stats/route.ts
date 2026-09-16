import { NextRequest } from 'next/server';
import { and, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { licenseT } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { licenseCardCondition, type LicenseCardKey } from '@/db/queries/licenseFilters';

// GET /api/v1/licenses/stats
//
// The number on each dashboard card. Every bucket is counted through
// `licenseCardCondition` — the same predicate the list applies when the card is
// clicked — so a card can never report a figure the grid then contradicts
// (§4.29). Hand-written SQL here had already drifted: `issued` counted every
// ACTIVE licence including ones that expired months ago.
//
// Buckets, in the order the cards render:
//   * expired    — ACTIVE but past its expiry date (derived, never stored)
//   * expiring   — in date, but inside the 30-day renewal window
//   * active     — ACTIVE and still in date
//   * annulated  — ANNULATED
//   * modified   — MODIFIED
//   * prorogated — PROROGATED
//
// `total` is counted separately below rather than listed here: its predicate is
// "no predicate", and running it through licenseCardCondition would return
// undefined and silently count the same thing by accident rather than on purpose.

const BUCKETS = [
  'expired',
  'expiring',
  'active',
  'annulated',
  'modified',
  'prorogated',
] as const satisfies readonly LicenseCardKey[];

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const live = eq(licenseT.display, 'Y');

  const counted = await Promise.all(
    BUCKETS.map(async (key) => {
      const [row] = await db
        .select({ n: count() })
        .from(licenseT)
        .where(and(live, licenseCardCondition(key)));
      return [`${key}_count`, row?.n ?? 0] as const;
    }),
  );

  const [totalRow] = await db.select({ n: count() }).from(licenseT).where(live);

  return ok({
    total_count: totalRow?.n ?? 0,
    ...Object.fromEntries(counted),
  });
});
