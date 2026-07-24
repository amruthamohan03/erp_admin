'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Truck, Files, CalendarClock, CalendarCheck, Calendar, Clock, Weight, Package, MapPin, List } from 'lucide-react';

interface Dash {
  kpi: { total_files: number; today_files: number; week_files: number; month_files: number; year_files: number; avg_ceec_days: number; total_weight: number; total_bags: number };
  top_locations: Array<{ location_name: string; file_count: number }>;
  location_distribution: Array<{ location_name: string; tracking_count: number; total_weight: number; total_bags: number }>;
  client_type_distribution: Array<{ client_category: string; tracking_count: number }>;
  monthly_trend: Array<{ month_name: string; tracking_count: number; total_weight: number }>;
  horse_performance: Array<{ horse_name: string; trip_count: number }>;
  trailer_performance: Array<{ trailer_name: string; trip_count: number }>;
  top_clients: Array<{ company_name: string; short_name: string; tracking_count: number; total_weight: number }>;
  recent_trackings: Array<Record<string, unknown>>;
}

const num = (n: number) => (n ?? 0).toLocaleString();
const dec = (n: number, d = 2) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const TOP_COLORS = ['#6366f1', '#10b981', '#f59e0b'];

function HBars({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="text-sm text-slate-400 py-8 text-center">No data</p>;
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.label + i} className="flex items-center gap-2">
          <span className="w-28 text-xs text-slate-600 dark:text-slate-300 text-right truncate" title={d.label}>{d.label}</span>
          <div className="flex-1 h-6 bg-slate-100 dark:bg-slate-800 rounded relative overflow-hidden">
            <div className="h-full rounded flex items-center justify-end pr-2 text-[11px] text-white font-medium bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${(d.value / max) * 100}%`, minWidth: '1.75rem' }}>{num(d.value)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LocalDashboardPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/locals/dashboard').then((r) => r.json()).then((j) => { if (!cancelled) { if (j.ok) setD(j.data); setLoading(false); } }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const k = d?.kpi;
  const maxMonth = Math.max(1, ...(d?.monthly_trend ?? []).map((m) => m.tracking_count));

  const tiles = [
    { label: 'Total Files', value: num(k?.total_files ?? 0), icon: <Files className="h-5 w-5" />, grad: 'from-indigo-500 to-violet-600' },
    { label: 'Today', value: num(k?.today_files ?? 0), icon: <CalendarClock className="h-5 w-5" />, grad: 'from-emerald-500 to-teal-600' },
    { label: 'This Week', value: num(k?.week_files ?? 0), icon: <Calendar className="h-5 w-5" />, grad: 'from-amber-500 to-orange-500' },
    { label: 'This Month', value: num(k?.month_files ?? 0), icon: <CalendarCheck className="h-5 w-5" />, grad: 'from-rose-500 to-red-600' },
    { label: 'This Year', value: num(k?.year_files ?? 0), icon: <Calendar className="h-5 w-5" />, grad: 'from-violet-500 to-purple-600' },
    { label: 'Avg CEEC Days', value: dec(k?.avg_ceec_days ?? 0, 1), icon: <Clock className="h-5 w-5" />, grad: 'from-cyan-500 to-sky-600' },
    { label: 'Total Weight (T)', value: dec(k?.total_weight ?? 0, 1), icon: <Weight className="h-5 w-5" />, grad: 'from-teal-500 to-emerald-600' },
    { label: 'Total Bags', value: num(k?.total_bags ?? 0), icon: <Package className="h-5 w-5" />, grad: 'from-sky-500 to-blue-600' },
  ];

  return (
    <>
      <div className="card p-5 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white"><Truck className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Local Tracking Dashboard</h1>
            <p className="text-sm text-slate-500">Overview of local tracking activities</p>
          </div>
        </div>
        <Link href="/local" className="btn-primary"><List className="h-4 w-4" /> All Trackings</Link>
      </div>

      {loading && <div className="card p-6 text-center text-slate-500">Loading dashboard…</div>}

      {!loading && d && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {tiles.map((t) => (
              <div key={t.label} className={`rounded-xl p-4 text-white shadow-sm bg-gradient-to-br ${t.grad}`}>
                <div className="flex items-start justify-between">
                  <div><div className="text-[11px] uppercase tracking-wide text-white/80">{t.label}</div><div className="text-2xl font-bold mt-1">{t.value}</div></div>
                  <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center">{t.icon}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Top 3 locations */}
          <div className="card p-4 mb-5">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2"><MapPin className="h-4 w-4" /> Top Locations</h3>
            <div className="flex flex-wrap gap-2">
              {d.top_locations.length === 0 ? <span className="text-sm text-slate-400">No data</span> : d.top_locations.map((l, i) => (
                <span key={l.location_name} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-white font-semibold text-sm" style={{ background: TOP_COLORS[i] ?? '#64748b' }}>
                  {l.location_name} <span className="opacity-90">· {num(l.file_count)} files</span>
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <div className="card p-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">Location Distribution</h3>
              <HBars data={d.location_distribution.map((l) => ({ label: l.location_name, value: l.tracking_count }))} />
            </div>
            <div className="card p-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">Client Types</h3>
              <HBars data={d.client_type_distribution.map((c) => ({ label: c.client_category, value: c.tracking_count }))} />
            </div>
          </div>

          {/* Monthly trend */}
          <div className="card p-4 mb-5">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">Monthly Trend (Last 12 Months)</h3>
            {d.monthly_trend.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center">No data</p> : (
              <div className="flex items-end gap-2 h-40">
                {d.monthly_trend.map((m) => (
                  <div key={m.month_name} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="text-[10px] text-slate-600 dark:text-slate-400">{m.tracking_count}</div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-t flex items-end" style={{ height: '100%' }}>
                      <div className="w-full bg-gradient-to-t from-indigo-500 to-violet-400 rounded-t" style={{ height: `${(m.tracking_count / maxMonth) * 100}%` }} title={`${m.month_name}: ${m.tracking_count}`} />
                    </div>
                    <div className="text-[10px] text-slate-500 truncate w-full text-center">{m.month_name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <div className="card p-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">Top 10 Horses</h3>
              <HBars data={d.horse_performance.map((h) => ({ label: h.horse_name, value: h.trip_count }))} />
            </div>
            <div className="card p-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">Top 10 Trailers</h3>
              <HBars data={d.trailer_performance.map((t) => ({ label: t.trailer_name, value: t.trip_count }))} />
            </div>
          </div>

          {/* Top clients */}
          <div className="card mb-5">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-800 dark:text-slate-200">Top 10 Clients</div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th className="w-12">#</th><th>Client</th><th className="text-right">Trackings</th><th className="text-right">Weight (T)</th></tr></thead>
                <tbody>
                  {d.top_clients.length === 0 && (<tr><td colSpan={4} className="text-center text-slate-500 py-6">No data</td></tr>)}
                  {d.top_clients.map((c, i) => (
                    <tr key={c.short_name + i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="text-slate-500 font-medium">{i + 1}</td>
                      <td className="font-medium">{c.company_name || c.short_name}</td>
                      <td className="text-right tabular-nums">{num(c.tracking_count)}</td>
                      <td className="text-right tabular-nums font-semibold">{dec(c.total_weight)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent trackings */}
          <div className="card">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-800 dark:text-slate-200">Recent Trackings</div>
            <div className="overflow-x-auto">
              <table className="table-base whitespace-nowrap">
                <thead><tr><th>#</th><th>Reference</th><th>Client</th><th>Location</th><th>Horse</th><th className="text-right">Weight</th><th className="text-right">Bags</th><th>CEEC Status</th></tr></thead>
                <tbody>
                  {d.recent_trackings.length === 0 && (<tr><td colSpan={8} className="text-center text-slate-500 py-6">No data</td></tr>)}
                  {d.recent_trackings.map((t) => {
                    const ceecOut = t.ceec_out as string | null;
                    const ceecIn = t.ceec_in as string | null;
                    const dur = t.ceec_duration_days as number | null;
                    return (
                      <tr key={String(t.id)} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs">
                        <td className="font-mono font-semibold">#{String(t.id)}</td>
                        <td className="font-mono">{String(t.mca_lt_reference ?? 'N/A')}</td>
                        <td>{String(t.short_name ?? 'N/A')}</td>
                        <td>{String(t.location_name ?? 'N/A')}</td>
                        <td>{String(t.horse ?? 'N/A')}</td>
                        <td className="text-right tabular-nums">{dec(Number(t.weight ?? 0))}</td>
                        <td className="text-right tabular-nums">{num(Number(t.nbr_of_bags ?? 0))}</td>
                        <td>
                          {ceecOut
                            ? <span className="inline-block rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">Done ({dur ?? 0} days)</span>
                            : ceecIn
                              ? <span className="inline-block rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">In Progress</span>
                              : <span className="inline-block rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">Pending</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
