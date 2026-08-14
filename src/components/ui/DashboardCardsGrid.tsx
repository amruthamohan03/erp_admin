'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  parseDataSource,
  resolveCardValue,
  distinctEndpoints,
} from '@/lib/dashboardDataSource';
import CardIcon from '@/components/ui/CardIcon';
import { gradient, flatIconBg } from '@/components/ui/cardGradient';

// Shared card-grid renderer used by every dashboard page. Fetches
// /api/v1/dashboard-cards/me, filters to the given category, then
// resolves each card's data_source (`<endpoint>#<json.path>`) and
// renders the colorful gradient tiles. One fetch per distinct
// endpoint — a dashboard of 8 cards all pointing at
// /api/v1/clients/dashboard hits the server once.

export interface DashboardCard {
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

interface DashboardCardsGridProps {
  /**
   * Category filter — matches `card_category` on
   * dashboard_card_master_t. Pass 'general' for cross-module
   * KPIs, 'client_dashboard' for /clients/dashboard, etc. Cards
   * with a missing category are hidden unless `category` is
   * 'general'. Omit entirely to show every card the role can
   * see — main's original /dashboard behavior.
   */
  category?: string;
  /**
   * Tile styling. 'gradient' (default) matches the colorful
   * per-module dashboards; 'flat' matches main's original
   * /dashboard — solid-color icon square on a light-blue tile.
   */
  variant?: 'gradient' | 'flat';
  /**
   * Message shown when no cards for this category are visible to
   * the current role. Defaults to a generic hint pointing at the
   * role-mapping admin screen.
   */
  emptyMessage?: React.ReactNode;
}

export default function DashboardCardsGrid({
  category,
  variant = 'gradient',
  emptyMessage,
}: DashboardCardsGridProps) {
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/dashboard-cards/me')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) {
          const all = j.data as DashboardCard[];
          const filtered = !category
            ? all
            : all.filter((c) =>
                category === 'general'
                  ? !c.card_category || c.card_category === 'general'
                  : c.card_category === category,
              );
          setCards(filtered);
        }
      })
      .catch(() => {
        /* leave cards empty — UI shows the empty state */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

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

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading cards…</div>;
  }

  if (cards.length === 0) {
    return (
      <div className="card p-6 text-sm text-slate-600">
        {emptyMessage ?? (
          <>
            No dashboard cards for this section are assigned to your role
            yet. Configure them in{' '}
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
          </>
        )}
      </div>
    );
  }

  const gridCols =
    variant === 'flat'
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className={`grid ${gridCols} gap-4`}>
      {cards.map((c) => {
        const body =
          variant === 'flat' ? (
            <div className="rounded-xl bg-sky-50/60 border border-slate-200 p-5 h-full flex items-center gap-4 shadow-sm hover:bg-sky-50 transition-colors">
              <div
                className={`h-12 w-12 rounded-lg ${flatIconBg(c.card_color)} flex items-center justify-center text-white shrink-0`}
              >
                <CardIcon name={c.card_icon} className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-muted-foreground truncate">
                  {c.card_title}
                </div>
                <div className="text-2xl font-bold text-slate-900 truncate">
                  {formatCardValue(values[c.card_key]) ?? '—'}
                </div>
                {c.card_subtitle && (
                  <div className="text-xs text-muted-foreground truncate">
                    {c.card_subtitle}
                  </div>
                )}
              </div>
            </div>
          ) : (
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
  );
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
