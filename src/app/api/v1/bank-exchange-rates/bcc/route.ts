import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dgiCurrencyRate } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { bccRateQuerySchema } from '@/schemas';

// GET /api/v1/bank-exchange-rates/bcc?currency=USD&date=YYYY-MM-DD&force=1
//
// What the BCC published for a day, behind the refresh button beside the BCC
// Rate box. Ported from main's getBccRate(), including the part that looks like
// a missing feature and is not:
//
//   1. the dgi_currency_rate_t cache for the requested date (skipped on `force`,
//      which is what the button sends — a manual click means "look again");
//   2. a LIVE e-MCF call, but ONLY when the requested date is TODAY. DGI answers
//      with the *current* rate whatever date you ask about, so using it for a
//      back-dated day would file today's number against an older one;
//   3. nothing. There is deliberately NO fall back to the last rate on file.
//
// Step 3 is the important one. A stale rate shown in a box captioned "from DGI"
// would be saved as though it had been published that day, and nobody could tell
// afterwards. An empty field that says why is the honest answer (§4.23), and the
// operator types the rate from the BCC publication as they always could.

/** The response when there is no rate to give — never an error, just an answer. */
interface NoRate {
  rate: null;
  source: null;
  date: string;
  cached: false;
  message: string;
}

interface FoundRate {
  rate: number;
  source: string;
  date: string;
  cached: boolean;
}

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** e-MCF is a deployment concern, so its absence is a configuration state, not a fault. */
function emcfConfig(): { url: string; token: string; timeoutMs: number } | null {
  const base = process.env.EMCF_BASE_URL?.trim();
  const token = process.env.EMCF_JWT_TOKEN?.trim();
  if (!base || !token) return null;
  // BASE_URL points at .../edef/api/invoice; the rates live under .../info.
  const url = `${base.replace(/\/invoice\/?$/, '/info')}/currencyRates`;
  return { url, token, timeoutMs: Number(process.env.EMCF_TIMEOUT_MS ?? 15000) };
}

interface EmcfRate {
  type?: string;
  curCode?: string;
  code?: string;
  currency?: string;
  rate?: number | string;
  curRate?: number | string;
  date?: string;
  curDate?: string;
}

/** DGI has shipped at least four spellings of these fields; accept all of them. */
const codeOf = (r: EmcfRate): string =>
  String(r.type ?? r.curCode ?? r.code ?? r.currency ?? '').toUpperCase();
const rateOf = (r: EmcfRate): number => Number(r.rate ?? r.curRate ?? 0);
const dateOf = (r: EmcfRate): string | null => r.date ?? r.curDate ?? null;

async function fetchEmcfRates(): Promise<EmcfRate[]> {
  const cfg = emcfConfig();
  if (!cfg) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(cfg.url, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.token}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && Array.isArray((body as { rates?: unknown }).rates)) {
      return (body as { rates: EmcfRate[] }).rates;
    }
    return Array.isArray(body) ? (body as EmcfRate[]) : [];
  } catch {
    // Unreachable, timed out, or not JSON. The caller reports "enter it
    // manually" either way — a rate provider being down must never be the reason
    // an operator cannot record a day.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Cache every rate the call returned, not just the one asked for. */
async function cacheRates(rates: EmcfRate[]): Promise<void> {
  const rows = rates
    .map((r) => ({ code: codeOf(r), rate: rateOf(r), day: dateOf(r) }))
    .filter((r) => r.code !== '' && r.rate > 0)
    .map((r) => ({
      currencyCode: r.code,
      rate: String(r.rate),
      rateDate: r.day ? new Date(r.day).toISOString().slice(0, 10) : todayIso(),
    }));
  if (rows.length === 0) return;

  for (const row of rows) {
    await db
      .insert(dgiCurrencyRate)
      .values(row)
      .onConflictDoUpdate({
        target: [dgiCurrencyRate.currencyCode, dgiCurrencyRate.rateDate],
        set: { rate: row.rate, updatedAt: new Date() },
      });
  }
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = bccRateQuerySchema.parse({
    currency: searchParams.get('currency') ?? undefined,
    date: searchParams.get('date') ?? undefined,
    force: searchParams.get('force') ?? undefined,
  });
  const currency = q.currency.toUpperCase();
  const today = todayIso();

  // 1. Cached.
  if (!q.force) {
    const [hit] = await db
      .select({ rate: dgiCurrencyRate.rate, rate_date: dgiCurrencyRate.rateDate })
      .from(dgiCurrencyRate)
      .where(
        and(
          sql`upper(${dgiCurrencyRate.currencyCode}) = ${currency}`,
          eq(dgiCurrencyRate.rateDate, q.date),
        ),
      )
      .limit(1);
    if (hit && Number(hit.rate) > 0) {
      const found: FoundRate = {
        rate: Number(hit.rate),
        source: `DGI (${hit.rate_date})`,
        date: hit.rate_date,
        cached: true,
      };
      return ok(found);
    }
  }

  // 2. Live — today only.
  if (q.date === today) {
    const rates = await fetchEmcfRates();
    if (rates.length > 0) {
      await cacheRates(rates);
      const match = rates.find((r) => codeOf(r) === currency);
      const value = match ? rateOf(match) : 0;
      if (value > 0) {
        const day = dateOf(match as EmcfRate);
        const found: FoundRate = {
          rate: value,
          source: 'e-MCF',
          date: day ? new Date(day).toISOString().slice(0, 10) : today,
          cached: false,
        };
        return ok(found);
      }
    }
  }

  // 3. Nothing — and say which of the two reasons it is, because they call for
  // different things from the operator (§4.23).
  const none: NoRate = {
    rate: null,
    source: null,
    date: q.date,
    cached: false,
    message: emcfConfig()
      ? q.date === today
        ? `BCC rate not available from DGI — enter ${currency} manually.`
        : `No BCC rate stored for ${q.date} — enter ${currency} manually.`
      : // A third case main never had, because main was always configured. Saying
        // "not available from DGI" when nobody ever set DGI up sends an operator
        // chasing a provider outage that is not happening.
        `DGI lookup is not configured on this server — enter the ${currency} rate manually.`,
  };
  return ok(none);
});
