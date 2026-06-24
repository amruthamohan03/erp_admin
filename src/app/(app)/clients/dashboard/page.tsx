'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Calendar,
  Sunrise,
  CheckCircle2,
  Mail,
  Phone,
  Hash,
  Activity,
} from 'lucide-react';
import StatCard from '@/components/ui/StatCard';

interface Aggregates {
  total_count: number;
  active_count: number;
  this_month_count: number;
  today_count: number;
  with_email_count: number;
  with_phone_count: number;
  with_tax_id_count: number;
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

interface DashboardData {
  aggregates: Aggregates;
  monthly: MonthlyRow[];
  top_activity: ActivityRow[];
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
  // The PG MAX() return is an ISO-ish string; cut to YYYY-MM-DD.
  return s.slice(0, 10);
}

export default function ClientsDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/clients/dashboard');
        const json = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error?.message ?? 'Failed to load dashboard');
        } else {
          setData(json.data);
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

  if (loading) {
    return (
      <div className="text-center text-slate-500 py-20">Loading dashboard...</div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 border border-red-200">
        {error ?? 'No data'}
      </div>
    );
  }

  const a = data.aggregates;
  // For the monthly bar chart we render a simple horizontal bar per
  // month — the value is scaled against the peak so the highest bar
  // hits 100%. Empty months show a thin track so the timeline shape
  // stays legible.
  const peak = Math.max(1, ...data.monthly.map((m) => m.n));

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Active clients"
          value={fmtCount(a.active_count)}
        />
        <StatCard
          icon={<Calendar className="h-5 w-5" />}
          label="Onboarded this month"
          value={fmtCount(a.this_month_count)}
        />
        <StatCard
          icon={<Sunrise className="h-5 w-5" />}
          label="Onboarded today"
          value={fmtCount(a.today_count)}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Total (incl. disabled)"
          value={fmtCount(a.total_count)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <StatCard
          icon={<Mail className="h-5 w-5" />}
          label="With email"
          value={`${fmtCount(a.with_email_count)} / ${fmtCount(a.active_count)}`}
        />
        <StatCard
          icon={<Phone className="h-5 w-5" />}
          label="With phone"
          value={`${fmtCount(a.with_phone_count)} / ${fmtCount(a.active_count)}`}
        />
        <StatCard
          icon={<Hash className="h-5 w-5" />}
          label="With tax ID"
          value={`${fmtCount(a.with_tax_id_count)} / ${fmtCount(a.active_count)}`}
        />
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
            {data.monthly.map((m) => {
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
                {data.top_activity.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-500 py-8">
                      No client activity yet
                    </td>
                  </tr>
                )}
                {data.top_activity.map((r) => (
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
