'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  parseDataSource,
  resolveCardValue,
  distinctEndpoints,
} from '@/lib/dashboardDataSource';
import CardIcon from '@/components/ui/CardIcon';
import { gradient } from '@/components/ui/cardGradient';

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

export default function DashboardPage() {
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/dashboard-cards/me')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setCards(j.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Resolve each card's data_source. Format: '<endpoint>#<dot.json.path>'
  // — the path is optional. Cards pointing at the same endpoint share
  // one fetch so a dashboard of 10 cards all referencing
  // /api/v1/clients/dashboard hits the server once.
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

  // Only show cards in the 'general' category on /dashboard.
  // Module-specific cards (import_dashboard, export_dashboard, etc.)
  // render on their respective dashboards.
  const generalCards = cards.filter(
    (c) => !c.card_category || c.card_category === 'general',
  );

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>

      {loading && (
        <div className="text-sm text-slate-500">Loading cards…</div>
      )}

      {!loading && cards.length === 0 && (
        <div className="card p-6 text-sm text-slate-600">
          No dashboard cards have been assigned to your role yet. Configure
          them in{' '}
          <Link
            className="text-primary-600 underline"
            href="/masters/dashboard-cards"
          >
            Dashboard Cards
          </Link>{' '}
          and map them in{' '}
          <Link
            className="text-primary-600 underline"
            href="/mapping/roletodashboardcard"
          >
            Role → Dashboard Cards
          </Link>
          .
        </div>
      )}

      {!loading && generalCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {generalCards.map((c) => {
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
    </>
  );
}

function formatCardValue(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === 'number') {
    // Whole numbers as-is; fractional stripped to 2 decimals.
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

