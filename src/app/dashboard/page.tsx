'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardShell from '@/components/layout/DashboardShell';

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
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard-cards/me')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setCards(j.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Resolve each card's data_source (must be an /api/* path that returns
  // { success, data }). Anything else is left as a plain card.
  useEffect(() => {
    if (cards.length === 0) return;
    const apiCards = cards.filter(
      (c) => c.data_source && c.data_source.startsWith('/api/'),
    );
    if (apiCards.length === 0) return;

    let cancelled = false;
    Promise.all(
      apiCards.map(async (c) => {
        try {
          const res = await fetch(c.data_source as string);
          const json = await res.json();
          if (!json?.success) return [c.card_key, '—'] as const;
          const d = json.data;
          const v =
            typeof d === 'number'
              ? d
              : d?.value ?? d?.total ?? d?.count ?? (Array.isArray(d) ? d.length : null);
          return [c.card_key, v ?? '—'] as const;
        } catch {
          return [c.card_key, '—'] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setValues(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [cards]);

  return (
    <DashboardShell>
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
                    {values[c.card_key] ?? (c.card_subtitle || '—')}
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
    </DashboardShell>
  );
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
