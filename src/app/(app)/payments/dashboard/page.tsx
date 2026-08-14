'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, CreditCard, CircleCheck, XCircle, Clock, Wallet, TrendingUp } from 'lucide-react';

// Payment Dashboard — KPIs, monthly revenue trend, status breakdown, top
// clients. Data from /api/v1/payments/dashboard. Charts are inline (no new dep).

interface Dash {
  kpi: {
    total_payments: number; total_amount: number; paid: number; rejected: number;
    pending: number; today: number; this_week: number; this_month: number; this_year: number;
  };
  status_cards: Array<{ status_name: string; count: number }>;
  monthly: Array<{ month_name: string; total: number; revenue: number }>;
  top_clients: Array<{ company_name: string; total: number; revenue: number }>;
}

const num = (n: number) => (n ?? 0).toLocaleString();
const money = (n: number) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CLS: Record<string, string> = {
  Paid: 'bg-emerald-100 text-emerald-800',
  Rejected: 'bg-rose-100 text-rose-800',
  'Under Process': 'bg-sky-100 text-sky-800',
  'Pending Payment': 'bg-orange-100 text-orange-800',
  'Pending Mgmt': 'bg-violet-100 text-violet-800',
  'Pending Finance': 'bg-cyan-100 text-cyan-800',
  'Pending Dept': 'bg-amber-100 text-amber-800',
};

export default function PaymentDashboardPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/payments/dashboard').then((r) => r.json()).then((j) => {
      if (cancelled) return;
      if (j.ok) setD(j.data);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const kpi = d?.kpi;
  const maxRev = Math.max(1, ...(d?.monthly ?? []).map((m) => m.revenue));

  const tiles = [
    { label: 'Total Payments', value: num(kpi?.total_payments ?? 0), icon: <CreditCard className="h-5 w-5" />, grad: 'from-indigo-500 to-violet-600' },
    { label: 'Total Amount', value: money(kpi?.total_amount ?? 0), icon: <TrendingUp className="h-5 w-5" />, grad: 'from-sky-500 to-blue-600' },
    { label: 'Paid', value: num(kpi?.paid ?? 0), icon: <CircleCheck className="h-5 w-5" />, grad: 'from-emerald-500 to-teal-600' },
    { label: 'Rejected', value: num(kpi?.rejected ?? 0), icon: <XCircle className="h-5 w-5" />, grad: 'from-rose-500 to-red-600' },
    { label: 'Pending', value: num(kpi?.pending ?? 0), icon: <Clock className="h-5 w-5" />, grad: 'from-amber-500 to-orange-500' },
    { label: 'Today', value: num(kpi?.today ?? 0), icon: <Wallet className="h-5 w-5" />, grad: 'from-violet-500 to-purple-600' },
    { label: 'This Month', value: num(kpi?.this_month ?? 0), icon: <Wallet className="h-5 w-5" />, grad: 'from-cyan-500 to-sky-600' },
    { label: 'This Year', value: num(kpi?.this_year ?? 0), icon: <Wallet className="h-5 w-5" />, grad: 'from-teal-500 to-emerald-600' },
  ];

  return (
    <>
      <div className="card p-5 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white"><BarChart3 className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Payment Dashboard</h1>
            <p className="text-sm text-muted-foreground">Real-time payment insights</p>
          </div>
        </div>
        <Link href="/payments" className="btn-primary"><Wallet className="h-4 w-4" /> Payment Requests</Link>
      </div>

      {loading && <div className="card p-6 text-center text-muted-foreground">Loading dashboard…</div>}

      {!loading && d && (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {tiles.map((t) => (
              <div key={t.label} className={`rounded-xl p-4 text-white shadow-sm bg-gradient-to-br ${t.grad}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-white/80">{t.label}</div>
                    <div className="text-2xl font-bold mt-1">{t.value}</div>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center">{t.icon}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            {/* Monthly revenue */}
            <div className="card p-4 lg:col-span-2">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">Monthly Revenue</h3>
              {d.monthly.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">No data</p>
              ) : (
                <div className="flex items-end gap-2 h-48">
                  {d.monthly.map((m) => (
                    <div key={m.month_name} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div className="text-[10px] text-slate-600 dark:text-muted-foreground tabular-nums">{money(m.revenue)}</div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-t flex items-end" style={{ height: '100%' }}>
                        <div className="w-full bg-gradient-to-t from-indigo-500 to-violet-400 rounded-t" style={{ height: `${(m.revenue / maxRev) * 100}%` }} title={`${m.month_name}: ${money(m.revenue)}`} />
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate w-full text-center">{m.month_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Status breakdown */}
            <div className="card p-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">Status Overview</h3>
              {d.status_cards.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">No data</p>
              ) : (
                <div className="space-y-2">
                  {d.status_cards.map((s) => (
                    <div key={s.status_name} className="flex items-center justify-between">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLS[s.status_name] ?? 'bg-slate-100 text-slate-700'}`}>{s.status_name}</span>
                      <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top clients */}
          <div className="card">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-800 dark:text-slate-200">Top Clients by Volume</div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th className="w-12">#</th><th>Client</th><th className="text-right">Requests</th><th className="text-right">Total Amount</th></tr></thead>
                <tbody>
                  {d.top_clients.length === 0 && (<tr><td colSpan={4} className="text-center text-muted-foreground py-6">No data</td></tr>)}
                  {d.top_clients.map((c, i) => (
                    <tr key={c.company_name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="text-muted-foreground font-medium">{i + 1}</td>
                      <td className="font-medium">{c.company_name}</td>
                      <td className="text-right tabular-nums">{num(c.total)}</td>
                      <td className="text-right tabular-nums font-semibold">{money(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
