'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Calendar, Activity } from 'lucide-react';
import {
  parseDataSource,
  resolveCardValue,
  distinctEndpoints,
} from '@/lib/dashboardDataSource';
import CardIcon from '@/components/ui/CardIcon';
import { gradient } from '@/components/ui/cardGradient';

// Card-driven Client Dashboard. Renders the seeded
// `card_category='client_dashboard'` rows from dashboard_card_master_t
// as colorful gradient tiles (same visual as /dashboard), then adds
// two extra sections below: monthly registration trend + top clients
// by consignment volume — the aggregate views main called out.

interface DashboardCard {
  id: number;
  card_key: string;
  card_content_id: string;
  card_title: string;
  card_subtitle: string | null;
  card_icon: string | null;
  card_color: string | null;
  card_url: string | null;
  card_category: string | null;
  data_source: string | null;
}

interface MonthlyRow {
  month: string;
  n: number;
}

interface ActivityRow {
  client_id: number;
  client_code: string;
  client_name: string;
  import_count: number;
  export_count: number;
  total_fob: number;
  last_activity_at: string | null;
}

function fmtCount(n: number): string {
  return n.toLocaleString();
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return s.slice(0, 10);
}

function formatCardValue(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === 'number') {
    return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
  }
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export default function ClientsDashboardPage() {
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [topActivity, setTopActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch cards + aggregate payload in parallel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cardsRes, dashRes] = await Promise.all([
          fetch('/api/v1/dashboard-cards/me').then((r) => r.json()),
          fetch('/api/v1/clients/dashboard').then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (cardsRes?.ok) {
          setCards(
            (cardsRes.data as DashboardCard[]).filter(
              (c) => c.card_category === 'client_dashboard',
            ),
          );
        }
        if (dashRes?.ok) {
          setMonthly(dashRes.data.monthly ?? []);
          setTopActivity(dashRes.data.top_activity ?? []);
        }
      } catch {
        if (!cancelled) setError('Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve card data_source values — same pattern as /dashboard.
  useEffect(() => {
    if (cards.length === 0) return;
    const apiCards = cards.filter(
      (c) =>
        c.data_source &&
        parseDataSource(c.data_source)?.endpoint.startsWith('/api/v1/'),
    );
    if (apiCards.length === 0) return;

    let cancelled = false;
    (async () => {
      const endpoints = distinctEndpoints(apiCards);
      const dataMap = new Map<string, unknown>();
      await Promise.all(
        endpoints.map(async (ep) => {
          try {
            const res = await fetch(ep);
            const json = await res.json();
            if (json?.ok) dataMap.set(ep, json.data);
          } catch {
            /* leave dataMap entry absent — card falls back to '—' */
          }
        }),
      );
      if (cancelled) return;

      const entries: Array<[string, unknown]> = [];
      for (const c of apiCards) {
        const parsed = parseDataSource(c.data_source);
        if (!parsed) {
          entries.push([c.card_key, '—']);
          continue;
        }
        const data = dataMap.get(parsed.endpoint);
        if (data === undefined) {
          entries.push([c.card_key, '—']);
          continue;
        }
        const v = resolveCardValue(data, parsed.path);
        entries.push([c.card_key, v ?? '—']);
      }
      setValues(Object.fromEntries(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, [cards]);

  const peak = Math.max(1, ...monthly.map((m) => m.n));

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-primary-600" />
            Clients Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Onboarding metrics + top consignment activity.{' '}
            <Link
              href="/masters/clients"
              className="text-primary-600 hover:underline"
            >
              Manage clients →
            </Link>
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-sm text-slate-500">Loading dashboard…</div>
      )}

      {!loading && cards.length === 0 && (
        <div className="card p-6 text-sm text-slate-600 mb-6">
          No client dashboard cards are assigned to your role yet. Seed
          rows exist in dashboard_card_master_t under
          <code className="mx-1">card_category=&apos;client_dashboard&apos;</code>;
          grant them via{' '}
          <Link
            className="text-primary-600 underline"
            href="/mapping/roletodashboardcard"
          >
            Role → Dashboard Cards
          </Link>
          .
        </div>
      )}

      {!loading && cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {cards.map((c) => {
            const body = (
              <div
                className={`rounded-xl p-5 h-full flex flex-col justify-between text-white shadow-sm bg-gradient-to-br ${gradient(c.card_color)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs uppercase tracking-wide text-white/80 truncate">
                      {c.card_title}
                    </div>
                    <div className="text-3xl font-bold mt-1 truncate">
                      {formatCardValue(values[c.card_key]) ?? '—'}
                    </div>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <CardIcon name={c.card_icon} className="h-5 w-5" />
                  </div>
                </div>
                {c.card_subtitle && (
                  <div className="text-xs text-white/80 mt-3 truncate">
                    {c.card_subtitle}
                  </div>
                )}
              </div>
            );
            return c.card_url ? (
              <Link
                key={c.id}
                href={c.card_url}
                className="block hover:scale-[1.02] transition-transform"
              >
                {body}
              </Link>
            ) : (
              <div key={c.id}>{body}</div>
            );
          })}
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="p-4 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-500" />
                Monthly registrations
                <span className="text-xs text-slate-400 font-normal">
                  · last 12 months
                </span>
              </h2>
            </div>
            <div className="p-4 space-y-2">
              {monthly.map((m) => {
                const pct = Math.round((m.n / peak) * 100);
                return (
                  <div key={m.month} className="flex items-center gap-3">
                    <div className="w-16 text-xs font-mono text-slate-500">
                      {m.month}
                    </div>
                    <div className="flex-1 h-5 bg-slate-100 rounded relative overflow-hidden">
                      <div
                        className="h-full bg-primary-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-10 text-right text-xs font-mono text-slate-700">
                      {m.n}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="p-4 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-500" />
                Top clients by consignment volume
                <span className="text-xs text-slate-400 font-normal">
                  · top 10
                </span>
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th className="text-right">Imports</th>
                    <th className="text-right">Exports</th>
                    <th className="text-right">FOB</th>
                    <th>Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {topActivity.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-slate-500 py-8">
                        No client activity yet
                      </td>
                    </tr>
                  )}
                  {topActivity.map((r) => (
                    <tr key={r.client_id} className="hover:bg-slate-50">
                      <td>
                        <div className="font-medium">{r.client_name}</div>
                        <code className="text-xs text-slate-500">
                          {r.client_code}
                        </code>
                      </td>
                      <td className="text-right font-mono">
                        {fmtCount(r.import_count)}
                      </td>
                      <td className="text-right font-mono">
                        {fmtCount(r.export_count)}
                      </td>
                      <td className="text-right font-mono">
                        {fmtMoney(r.total_fob)}
                      </td>
                      <td className="text-sm text-slate-600">
                        {fmtDate(r.last_activity_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
