'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  parseDataSource,
  resolveCardValue,
  distinctEndpoints,
} from '@/lib/dashboardDataSource';

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
  // The shape of `values[card_key]` depends on each card's data_source —
  // resolveCardValue returns `unknown` so we keep it that way and let React
  // stringify in the render. Older narrow `string | number` typing forced
  // every endpoint to return a flat scalar.
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
  // — the path is optional. Cards pointing at the same endpoint share one
  // fetch, so a dashboard of 10 cards all referencing /api/v1/clients/stats
  // hits the server once. Anything not under /api/v1/* is left static.
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
            // Leave dataMap entry absent — the card falls back to '—'.
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

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>

      {loading && (
        <div className="text-sm text-slate-500">Loading cards…</div>
      )}

      {!loading && cards.length === 0 && (
        <div className="card p-6 text-sm text-slate-600">
          No dashboard cards have been assigned to your role yet. Configure
          them in <Link className="text-primary-600 underline" href="/masters/dashboard-cards">Dashboard Cards</Link>{' '}
          and map them in{' '}
          <Link className="text-primary-600 underline" href="/mapping/roletodashboardcard">Role &rarr; Dashboard Cards</Link>.
        </div>
      )}

      {!loading && cards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c) => {
            const body = (
              <div className="card p-6 flex items-center gap-4 h-full">
                <div
                  className={`h-12 w-12 rounded-lg ${colorClass(c.card_color)} flex items-center justify-center text-white text-xl`}
                >
                  <i className={`bi ${c.card_icon ?? 'bi-card-text'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-500 truncate">
                    {c.card_title}
                  </div>
                  <div className="text-2xl font-bold text-slate-900 truncate">
                    {formatCardValue(values[c.card_key]) ?? (c.card_subtitle || '—')}
                  </div>
                  {c.card_subtitle && values[c.card_key] !== undefined && (
                    <div className="text-xs text-slate-500 truncate">
                      {c.card_subtitle}
                    </div>
                  )}
                </div>
              </div>
            );

            return c.card_url ? (
              <Link
                key={c.id}
                href={c.card_url}
                className="block hover:opacity-90 transition-opacity"
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

// resolveCardValue returns `unknown`; React's render slot wants a primitive.
// Strings + numbers pass through; anything else (objects, arrays from
// malformed responses) gets JSON-stringified so the UI shows *something*
// instead of throwing. null/undefined surface as null so the caller's `??`
// fallback fires.
function formatCardValue(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number') return v;
  if (typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function colorClass(color: string | null | undefined): string {
  switch ((color ?? '').toLowerCase()) {
    case 'success':
      return 'bg-emerald-500';
    case 'warning':
      return 'bg-amber-500';
    case 'danger':
      return 'bg-red-500';
    case 'info':
      return 'bg-sky-500';
    case 'purple':
      return 'bg-purple-500';
    case 'teal':
      return 'bg-teal-500';
    case 'pink':
      return 'bg-pink-500';
    case 'primary':
    default:
      return 'bg-blue-500';
  }
}

