'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Anchor,
  Ship,
  FileText,
  ClipboardList,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { formatDate } from '@/lib/formatDate';

// Recent-activity feed for /dashboard. Four panels (imports,
// exports, quotations, licenses), each showing the 5 most recently
// created rows with client name + amount + link to the detail page.
// One HTTP call to /api/v1/dashboard/recent-activity fills all four.
//
// Purely additive to the existing DashboardCardsGrid — cards still
// render above, this widget slots underneath.

interface ActivityRow {
  id: number;
  ref: string | null;
  client_name: string | null;
  date: string;
  amount: string | null;
  state?: string; // licenses only
}

interface ActivityPayload {
  imports: ActivityRow[];
  exports: ActivityRow[];
  quotations: ActivityRow[];
  licenses: ActivityRow[];
}

const PANELS: Array<{
  key: keyof ActivityPayload;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  hrefBase: string;
  color: string; // Tailwind text-* color for the icon
  currency: string;
}> = [
  {
    key: 'imports',
    title: 'Recent imports',
    icon: Anchor,
    hrefBase: '/imports',
    color: 'text-blue-600',
    currency: 'USD',
  },
  {
    key: 'exports',
    title: 'Recent exports',
    icon: Ship,
    hrefBase: '/exports',
    color: 'text-emerald-600',
    currency: 'USD',
  },
  {
    key: 'quotations',
    title: 'Recent quotations',
    icon: FileText,
    hrefBase: '/quotations',
    color: 'text-amber-600',
    currency: 'USD',
  },
  {
    key: 'licenses',
    title: 'Recent licenses',
    icon: ClipboardList,
    hrefBase: '/licenses',
    color: 'text-purple-600',
    currency: 'USD',
  },
];

function fmtAmount(v: string | null, ccy: string): string {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${ccy} ${n.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

const fmtDate = (iso: string): string => formatDate(iso, '');

export default function RecentActivity() {
  const [data, setData] = useState<ActivityPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/dashboard/recent-activity')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setData(j.data as ActivityPayload);
      })
      .catch(() => {
        /* leave data null; empty state renders */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading recent activity…
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900 mb-3">
        Recent activity
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PANELS.map((p) => {
          const rows = data[p.key] ?? [];
          const Icon = p.icon;
          return (
            <div key={p.key} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${p.color}`} />
                  <h3 className="text-sm font-semibold text-slate-800">
                    {p.title}
                  </h3>
                </div>
                <Link
                  href={p.hrefBase}
                  className="text-xs text-primary-600 hover:underline flex items-center gap-1"
                >
                  See all <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              {rows.length === 0 ? (
                <div className="text-xs text-slate-500 py-3">
                  Nothing yet.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <li key={r.id} className="py-2">
                      <Link
                        href={`${p.hrefBase}/${r.id}`}
                        className="flex items-center justify-between gap-3 group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-800 group-hover:text-primary-600 truncate">
                            {r.ref ?? `#${r.id}`}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {r.client_name ?? '—'} · {fmtDate(r.date)}
                            {r.state ? ` · ${r.state}` : ''}
                          </div>
                        </div>
                        <div className="text-xs font-mono text-slate-700 shrink-0">
                          {fmtAmount(r.amount, p.currency)}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
