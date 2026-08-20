import { headers } from 'next/headers';
import { getSession } from '@/lib/auth';

// §4.28 — the request-derived half of an audit entry: who (their role), from
// where, on what device.
//
// Read here rather than passed in by every caller. There are ~20 recordAudit call
// sites; asking each to thread an IP through would mean ~20 chances to forget,
// and a missing IP is invisible until an investigation needs it.
//
// Never throws: an audit row with a null IP is worth far more than a write that
// rolls back because the header lookup failed outside a request scope (a seed
// script, a cron job).

export interface AuditRequestContext {
  actorRole: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

const EMPTY: AuditRequestContext = { actorRole: null, ipAddress: null, userAgent: null };

/**
 * The client IP behind a proxy.
 *
 * `x-forwarded-for` is a comma-separated chain where the FIRST entry is the
 * original client; the rest are the proxies it passed through. Taking the last
 * would record our own load balancer on every row.
 */
function clientIp(get: (k: string) => string | null): string | null {
  const forwarded = get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 45); // fits the column; IPv6 max is 45
  }
  return get('x-real-ip')?.slice(0, 45) ?? null;
}

export async function requestContext(): Promise<AuditRequestContext> {
  try {
    const h = await headers();
    const get = (k: string) => h.get(k);
    const session = await getSession().catch(() => null);
    return {
      actorRole: session?.role_name ?? null,
      ipAddress: clientIp(get),
      userAgent: get('user-agent'),
    };
  } catch {
    // Outside a request (seed, migration, scheduled job) there is no context to
    // read. The action is still logged; these three fields are simply unknown.
    return EMPTY;
  }
}
