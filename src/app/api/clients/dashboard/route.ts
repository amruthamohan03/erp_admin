// GET /api/clients/dashboard → all metrics + chart data for the Client Dashboard.
// One round-trip serves the whole page; all queries run in parallel via Promise.all.
import { and, count, eq, gte, isNotNull, lt, sql, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients, officeLocationMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [
      totalRows,
      activeRows,
      thisMonthRows,
      todayRows,
      verifiedRows,
      approvedRows,
      validContractRows,
      expiredRows,
      typeRows,
      locationRows,
      paymentRows,
      monthlyRows,
    ] = await Promise.all([
      db.select({ n: count() }).from(clients),
      db.select({ n: count() }).from(clients).where(eq(clients.display, 'Y')),
      db.select({ n: count() }).from(clients).where(gte(clients.createdAt, startOfMonth)),
      db.select({ n: count() }).from(clients).where(gte(clients.createdAt, startOfDay)),
      db.select({ n: count() }).from(clients).where(isNotNull(clients.verifiedById)),
      db.select({ n: count() }).from(clients).where(isNotNull(clients.approvedById)),
      db
        .select({ n: count() })
        .from(clients)
        .where(and(isNotNull(clients.contractValidity), gte(clients.contractValidity, sql`CURRENT_DATE`))),
      db
        .select({ n: count() })
        .from(clients)
        .where(and(isNotNull(clients.contractValidity), lt(clients.contractValidity, sql`CURRENT_DATE`))),

      // Client type distribution.
      db
        .select({ client_type: clients.clientType, n: count() })
        .from(clients)
        .where(eq(clients.display, 'Y'))
        .groupBy(clients.clientType),

      // Location distribution.
      db
        .select({
          location_id: clients.officeLocationId,
          location_name: officeLocationMaster.locationName,
          n: count(),
        })
        .from(clients)
        .leftJoin(officeLocationMaster, eq(clients.officeLocationId, officeLocationMaster.id))
        .where(eq(clients.display, 'Y'))
        .groupBy(clients.officeLocationId, officeLocationMaster.locationName),

      // Payment term distribution.
      db
        .select({ payment_term: clients.paymentTerm, n: count() })
        .from(clients)
        .where(and(eq(clients.display, 'Y'), isNotNull(clients.paymentTerm), ne(clients.paymentTerm, '')))
        .groupBy(clients.paymentTerm),

      // Monthly registration over the last 12 months.
      db
        .select({
          month: sql<string>`to_char(${clients.createdAt}, 'YYYY-MM')`,
          n: count(),
        })
        .from(clients)
        .where(gte(clients.createdAt, twelveMonthsAgo))
        .groupBy(sql`to_char(${clients.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${clients.createdAt}, 'YYYY-MM')`),
    ]);

    const stats = {
      total_clients:    totalRows[0]?.n         ?? 0,
      active_clients:   activeRows[0]?.n        ?? 0,
      this_month:       thisMonthRows[0]?.n     ?? 0,
      today:            todayRows[0]?.n         ?? 0,
      verified:         verifiedRows[0]?.n      ?? 0,
      approved:         approvedRows[0]?.n      ?? 0,
      valid_contracts:  validContractRows[0]?.n ?? 0,
      expired:          expiredRows[0]?.n       ?? 0,
    };

    // Bucket client_type values into the friendly labels the screenshot uses.
    const typeBuckets = new Map<string, number>();
    function labelForType(raw: string | null): string {
      const t = (raw ?? '').toUpperCase();
      if (!t) return 'Unspecified';
      if (t === 'I')   return 'Import';
      if (t === 'E')   return 'Export';
      if (t === 'L')   return 'Local';
      if (t === 'IE' || t === 'EI') return 'Import+Export';
      if (t === 'IEL' || t === 'IL' || t === 'EL' || t === 'LI' || t === 'LE') {
        return 'All';
      }
      return 'Other';
    }
    for (const r of typeRows) {
      const label = labelForType(r.client_type);
      typeBuckets.set(label, (typeBuckets.get(label) ?? 0) + r.n);
    }
    const client_type_distribution = Array.from(typeBuckets.entries()).map(([label, value]) => ({
      label,
      value,
    }));

    const location_distribution = locationRows
      .map((r) => ({
        label: r.location_name ?? 'Not Specified',
        value: r.n,
      }))
      // Largest first.
      .sort((a, b) => b.value - a.value);

    const payment_term_distribution = paymentRows.map((r) => ({
      label: r.payment_term ?? 'Unspecified',
      value: r.n,
    }));

    // Fill in any missing months between the earliest and now so the chart
    // doesn't have gaps. Months are 'YYYY-MM' keyed.
    const monthMap = new Map<string, number>();
    for (const r of monthlyRows) monthMap.set(r.month, r.n);
    const monthly_registration_trend: Array<{ month: string; value: number }> = [];
    for (let d = new Date(twelveMonthsAgo); d <= now; d.setMonth(d.getMonth() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly_registration_trend.push({ month: key, value: monthMap.get(key) ?? 0 });
    }

    return ok({
      stats,
      client_type_distribution,
      location_distribution,
      payment_term_distribution,
      monthly_registration_trend,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[clients.dashboard]', err);
    return fail('Server error', 500, { detail: (err as Error)?.message });
  }
}
