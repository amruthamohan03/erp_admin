import { NextRequest } from 'next/server';
import { and, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

// GET /api/v1/clients/stats
// KPIs for the dashboard cards. Six counts computable from existing
// client_master_t fields without any schema change:
//   total       — all active clients
//   this_month  — created in the current calendar month
//   today       — created today (server's tz)
//   with_email / with_phone / with_tax_id — profile-completeness proxies
//
// Each card on /dashboard can point its data_source at
// /api/v1/clients/stats#<key> so the new path resolution mechanism
// (commit 51c37c0) fans these out to many cards from one request.

async function activeCount(extra: ReturnType<typeof and> | undefined = undefined) {
  const base = eq(clientMaster.display, 'Y');
  const where = extra ? and(base, extra) : base;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clientMaster)
    .where(where);
  return Number(row?.n ?? 0);
}

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  // Compute the date boundaries once. Comparing against created_at — which is
  // a timestamp — works because date < timestamp is a valid operand pair in
  // Postgres (the date promotes to midnight).
  const monthStart = sql`date_trunc('month', current_date)`;
  const today = sql`current_date`;

  const [total, thisMonth, todayCount, withEmail, withPhone, withTaxId] =
    await Promise.all([
      activeCount(),
      activeCount(gte(clientMaster.createdAt, monthStart as unknown as Date)),
      activeCount(gte(clientMaster.createdAt, today as unknown as Date)),
      activeCount(isNotNull(clientMaster.email)),
      activeCount(isNotNull(clientMaster.phone)),
      activeCount(isNotNull(clientMaster.taxId)),
    ]);

  return ok({
    total,
    this_month: thisMonth,
    today: todayCount,
    with_email: withEmail,
    with_phone: withPhone,
    with_tax_id: withTaxId,
  });
});
