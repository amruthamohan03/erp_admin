'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Calendar, Activity } from 'lucide-react';
import DashboardCardsGrid from '@/components/ui/DashboardCardsGrid';

// Client dashboard. Cards on top come from
// `card_category='client_dashboard'` (see DashboardCardsGrid);
// the two extra sections below (monthly registrations + top clients
// by consignment volume) come from /api/v1/clients/dashboard's
// aggregate payload.

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

export default function ClientsDashboardPage() {
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [topActivity, setTopActivity] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/clients/dashboard');
        const json = await res.json();
        if (cancelled) return;
        if (json?.ok) {
          setMonthly(json.data.monthly ?? []);
          setTopActivity(json.data.top_activity ?? []);
        }
      } catch {
        if (!cancelled) setError('Failed to load client-activity data');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

      <div className="mb-6">
        <DashboardCardsGrid category="client_dashboard" />
      </div>

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
    </>
  );
}
