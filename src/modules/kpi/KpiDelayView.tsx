'use client';

// Shared Delay-KPI view for Import & Export tracking. All figures come from a
// configurable endpoint (/api/v1/imkpi or /api/v1/exkpi); the variable bits —
// title, links, the total key/label, client-comparison columns, drill-down
// detail fields and milestone labels — are supplied via `cfg`, so one component
// backs both KPIs (§4.10).
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, Search, X, FileInput, ChartBar, AlertOctagon, CircleCheck, Route, CalendarOff, Users, Download } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';

interface StageKpi {
  key: string; label: string; short: string; from: string; to: string; threshold: number; priority: boolean; color: string; icon: string;
  evaluated_count: number; on_time_count: number; delayed_count: number; avg_days: number; on_time_pct: number; delayed_pct: number;
}
type ClientRow = Record<string, string | number | null>;
interface Bottleneck { key: string; label: string; short: string; from: string; to: string; avg_days: number; sample_count: number; threshold: number; delayed_count: number; delayed_pct: number; priority: boolean }
interface Holiday { holiday_date: string; name_en: string; name_fr: string | null; holiday_type: string }
interface Payload {
  summary_kpis: Record<string, number>;
  priority_kpis: StageKpi[];
  stage_kpis: StageKpi[];
  bottleneck_analysis: Bottleneck[];
  client_delay_table: ClientRow[];
  drc_holidays: Holiday[];
  clients_list: Array<{ id: number; short_name: string }>;
  clearance_types: Array<{ id: number; clearance_name: string }>;
}

export interface KpiConfig {
  endpoint: string;        // 'imkpi' | 'exkpi'
  title: string;           // 'Import Delay KPI'
  listHref: string;        // '/imports'
  listLabel: string;       // 'Imports'
  totalKey: string;        // summary_kpis + client-row key for the record count
  totalLabel: string;      // 'Total Imports'
  totalThreshold: number;  // 21
  avgTotalSub: string;     // 'Pre Alert → Deliver'
  fieldLabels: Record<string, string>;
  clientColumns: Array<{ header: string; alias: string; threshold: number }>;
  drillFields: Array<[string, string, string?]>; // [label, rowKey, suffix?]
}

const num = (n: number) => (n ?? 0).toLocaleString();
const d1 = (n: number) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function DP({ v, th }: { v: number | null; th: number }) {
  if (v === null || v === 0) return <span className="text-slate-300">—</span>;
  const ok = v <= th;
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{d1(v)}d</span>;
}

function Ring({ avg, th }: { avg: number; th: number }) {
  const r = 34, circ = 2 * Math.PI * r;
  const p = avg > 0 ? Math.min(100, Math.round((avg / (th * 2)) * 100)) : 0;
  const over = avg > th;
  const clr = over ? '#e11d48' : '#059669';
  return (
    <div className="relative w-[88px] h-[88px] shrink-0">
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="7" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={clr} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(circ * p) / 100} ${circ}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold leading-none" style={{ color: clr }}>{avg > 0 ? d1(avg) : '—'}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">days</span>
      </div>
    </div>
  );
}

const EMPTY_FILTERS = { client_id: 'all', clearance_type: '', start_date: '', end_date: '' };
type Stage = { key: string; label: string; from: string; to: string };

export default function KpiDelayView({ cfg }: { cfg: KpiConfig }) {
  const fl = (k: string) => cfg.fieldLabels[k] ?? k;
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);

  const [drill, setDrill] = useState<Stage | null>(null);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [statusF, setStatusF] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams(applied);
      const res = await fetch(`/api/v1/${cfg.endpoint}?${p}`);
      const j = await res.json();
      if (j.ok) setData(j.data);
    } finally { setLoading(false); }
  }, [applied, cfg.endpoint]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const loadRecords = useCallback(async (stage: string, sf: string) => {
    setRecLoading(true); setExpanded(null);
    try {
      const p = new URLSearchParams({ ...applied, stage, status_filter: sf });
      const res = await fetch(`/api/v1/${cfg.endpoint}/stage-records?${p}`);
      const j = await res.json();
      setRecords(j.ok ? j.data.records : []);
    } finally { setRecLoading(false); }
  }, [applied, cfg.endpoint]);

  function openDrill(st: Stage) { setDrill(st); setStatusF(''); loadRecords(st.key, ''); }

  const s = data?.summary_kpis ?? {};
  const total = s[cfg.totalKey] ?? 0;
  const th = cfg.totalThreshold;
  const today = new Date().toISOString().slice(0, 10);

  const summaryCards = [
    { label: cfg.totalLabel, value: num(total), sub: 'All records', icon: <FileInput className="h-5 w-5" />, grad: 'from-indigo-500 to-violet-600' },
    { label: 'Delivered', value: num(s.fully_delivered ?? 0), sub: `${pct(s.fully_delivered ?? 0, total)}% of total`, icon: <Route className="h-5 w-5" />, grad: 'from-sky-500 to-blue-600' },
    { label: `On Time ≤${th}d`, value: num(s.on_time_total ?? 0), sub: `${pct(s.on_time_total ?? 0, total)}% of total`, icon: <CircleCheck className="h-5 w-5" />, grad: 'from-emerald-500 to-teal-600' },
    { label: `Delayed >${th}d`, value: num(s.delayed_total ?? 0), sub: `${pct(s.delayed_total ?? 0, total)}% of total`, icon: <AlertOctagon className="h-5 w-5" />, grad: 'from-rose-500 to-red-600' },
    { label: 'Avg Total', value: `${d1(s.avg_total_days ?? 0)}d`, sub: cfg.avgTotalSub, icon: <Clock className="h-5 w-5" />, grad: 'from-cyan-500 to-sky-600' },
  ];

  const holYear = useMemo(() => (data?.drc_holidays ?? []).filter((h) => h.holiday_date.slice(0, 4) === today.slice(0, 4)), [data, today]);
  const maxBottleneck = Math.max(1, ...(data?.bottleneck_analysis ?? []).map((b) => b.delayed_pct));

  return (
    <>
      <div className="card overflow-hidden mb-4">
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-blue-500 to-rose-500" />
        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white"><Clock className="h-6 w-6" /></span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{cfg.title}</h1>
              <p className="text-xs text-muted-foreground">On Time vs Delayed · Working days · Pending aged to today ({today})</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={cfg.listHref} className="btn-secondary"><FileInput className="h-4 w-4" /> {cfg.listLabel}</Link>
            <Link href="/dashboard" className="btn-secondary"><ChartBar className="h-4 w-4" /> Dashboard</Link>
          </div>
        </div>
      </div>

      <div className="card p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-end">
          <div>
            <label className="label">Client</label>
            {/* Options labelled by short code, per the client label rule (§4.15). */}
            <SearchableSelect
              aria-label="Client"
              value={f.client_id}
              options={[
                { value: 'all', label: 'All Clients' },
                ...(data?.clients_list ?? []).map((c) => ({ value: String(c.id), label: c.short_name })),
              ]}
              onChange={(v) => { setF((x) => ({ ...x, client_id: v })); setApplied((x) => ({ ...x, client_id: v })); }}
            />
          </div>
          <div>
            <label className="label">Type of Clearance</label>
            <SearchableSelect
              aria-label="Type of clearance"
              value={f.clearance_type}
              emptyLabel="All Types"
              placeholder="All Types"
              options={(data?.clearance_types ?? []).map((c) => ({ value: String(c.id), label: c.clearance_name }))}
              onChange={(v) => { setF((x) => ({ ...x, clearance_type: v })); setApplied((x) => ({ ...x, clearance_type: v })); }}
            />
          </div>
          <div>
            <label className="label">Created From</label>
            <input type="date" className="input" value={f.start_date} max={f.end_date || undefined} onChange={(e) => setF((x) => ({ ...x, start_date: e.target.value }))} />
          </div>
          <div>
            <label className="label">Created To</label>
            <input type="date" className="input" value={f.end_date} min={f.start_date || undefined} onChange={(e) => setF((x) => ({ ...x, end_date: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setApplied(f)} className="btn-primary"><Search className="h-4 w-4" /> Apply</button>
            {(applied.client_id !== 'all' || applied.clearance_type || applied.start_date || applied.end_date) && (
              <button type="button" onClick={() => { setF(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); }} className="btn-secondary"><X className="h-4 w-4" /> Clear</button>
            )}
          </div>
        </div>
      </div>

      {loading && <div className="card p-6 text-center text-muted-foreground">Loading KPIs…</div>}

      {!loading && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
            {summaryCards.map((c) => (
              <div key={c.label} className={`rounded-xl p-4 text-white shadow-sm bg-gradient-to-br ${c.grad}`}>
                <div className="flex items-start justify-between">
                  <div><div className="text-[11px] uppercase tracking-wide text-white/80">{c.label}</div><div className="text-2xl font-bold mt-1">{c.value}</div><div className="text-[10px] text-white/70 mt-0.5">{c.sub}</div></div>
                  <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center">{c.icon}</div>
                </div>
              </div>
            ))}
          </div>

          {data.priority_kpis.length > 0 && (
            <>
              <h2 className="text-xs font-bold uppercase tracking-widest text-rose-600 mb-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-500" /> Priority Metrics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                {data.priority_kpis.map((pk) => {
                  const over = pk.avg_days > pk.threshold;
                  return (
                    <div key={pk.key} className={`card p-4 border-l-4 ${over ? 'border-rose-500' : 'border-emerald-500'}`}>
                      <div className="flex items-start gap-4">
                        <Ring avg={pk.avg_days} th={pk.threshold} />
                        <div className="flex-1 min-w-0">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 mb-1"><i className={`ti ${pk.icon}`} /> {pk.short}</span>
                          <div className="font-bold text-slate-900 dark:text-slate-100 leading-tight">{pk.label}</div>
                          <div className={`text-sm font-bold mt-1 ${over ? 'text-rose-600' : 'text-emerald-600'}`}>Target ≤ {pk.threshold}d — {over ? '▲ DELAYED' : '✓ ON TIME'}</div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-lg border-l-2 border-emerald-500 bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
                          <div className="text-xl font-bold text-emerald-600">{num(pk.on_time_count)}</div>
                          <div className="text-[10px] uppercase font-bold text-muted-foreground">On Time ≤{pk.threshold}d</div>
                          <div className="text-xs font-bold text-emerald-600">{pk.on_time_pct}% of {num(pk.evaluated_count)}</div>
                        </div>
                        <div className="rounded-lg border-l-2 border-rose-500 bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
                          <div className="text-xl font-bold text-rose-600">{num(pk.delayed_count)}</div>
                          <div className="text-[10px] uppercase font-bold text-muted-foreground">Delayed &gt;{pk.threshold}d</div>
                          <div className="text-xs font-bold text-rose-600">{pk.delayed_pct}% of {num(pk.evaluated_count)}</div>
                        </div>
                      </div>
                      <div className="mt-2 h-2 rounded bg-slate-200 dark:bg-slate-700 flex overflow-hidden">
                        <div className="bg-emerald-500" style={{ width: `${pk.on_time_pct}%` }} />
                        <div className="bg-rose-500" style={{ width: `${pk.delayed_pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <h2 className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500" /> Stage-by-Stage Delay Analysis <span className="text-muted-foreground normal-case font-normal tracking-normal">· click to drill down</span></h2>
          <div className="space-y-2 mb-5">
            {data.stage_kpis.map((k, i) => {
              const over = k.avg_days > 0 && k.avg_days > k.threshold;
              const none = k.avg_days <= 0;
              return (
                <button key={k.key} type="button" onClick={() => openDrill(k)}
                  className={`w-full card p-0 overflow-hidden flex items-stretch text-left hover:shadow-md transition ${none ? '' : over ? 'border-l-4 border-rose-500' : 'border-l-4 border-emerald-500'}`}>
                  <div className="w-10 shrink-0 flex items-center justify-center font-bold text-lg border-r border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40" style={{ color: k.color }}>{i + 1}</div>
                  <div className="w-40 shrink-0 p-3 border-r border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <span className="h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: k.color }}><i className={`ti ${k.icon}`} /></span>
                    <span className="text-xs font-bold uppercase text-slate-700 dark:text-slate-200 leading-tight">{k.short}</span>
                  </div>
                  <div className="hidden lg:flex w-52 shrink-0 p-3 border-r border-slate-100 dark:border-slate-800 flex-col justify-center gap-1 text-[11px]">
                    <div><span className="text-muted-foreground font-bold w-8 inline-block">FROM</span> <span className="font-mono text-slate-700 dark:text-slate-200">{fl(k.from)}</span></div>
                    <div><span className="text-muted-foreground font-bold w-8 inline-block">TO</span> <span className="font-mono text-slate-700 dark:text-slate-200">{fl(k.to)}</span></div>
                  </div>
                  <div className="w-28 shrink-0 p-3 border-r border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-bold leading-none ${none ? 'text-slate-300' : over ? 'text-rose-600' : 'text-emerald-600'}`}>{k.avg_days > 0 ? d1(k.avg_days) : '—'}</span>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">avg days</span>
                    <span className={`mt-1 text-[10px] font-bold px-2 py-0.5 rounded ${over ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>Target ≤{k.threshold}d</span>
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-center gap-1.5 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase text-muted-foreground">{num(k.evaluated_count)} records evaluated</span>
                      <span className={`text-xs font-bold ${k.on_time_pct >= 80 ? 'text-emerald-600' : 'text-rose-600'}`}>{k.on_time_pct}% on time</span>
                    </div>
                    <div className="h-2 rounded bg-slate-200 dark:bg-slate-700 flex overflow-hidden">
                      <div className="bg-emerald-500" style={{ width: `${k.on_time_pct}%` }} />
                      <div className="bg-rose-500" style={{ width: `${k.delayed_pct}%` }} />
                    </div>
                    <div className="flex gap-4 text-[11px]">
                      <span className="text-emerald-600 font-semibold">● {num(k.on_time_count)} On Time</span>
                      <span className="text-rose-600 font-semibold">● {num(k.delayed_count)} Delayed</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <div className="card p-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2"><AlertOctagon className="h-4 w-4 text-rose-500" /> Top Bottlenecks <span className="text-xs text-muted-foreground font-normal">by % delayed</span></h3>
              <div className="space-y-2">
                {data.bottleneck_analysis.slice(0, 11).map((b, i) => (
                  <div key={b.key} className="flex items-center gap-2">
                    <span className="w-7 text-rose-500 font-bold text-sm">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{b.short}{b.priority && <span className="ml-1 text-[9px] rounded bg-rose-100 text-rose-700 px-1 uppercase">Priority</span>}</div>
                      <div className="text-[10px] text-muted-foreground">{num(b.sample_count)} records · target ≤{b.threshold}d · {num(b.delayed_count)} delayed</div>
                    </div>
                    <div className="w-24 h-2 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-rose-500" style={{ width: `${(b.delayed_pct / maxBottleneck) * 100}%` }} /></div>
                    <span className="w-10 text-right font-bold text-rose-600 text-sm">{b.delayed_pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2"><CalendarOff className="h-4 w-4 text-amber-500" /> DRC Public Holidays <span className="text-xs text-muted-foreground font-normal">excluded from delay days (Sat/Sun too)</span></h3>
              <div className="grid grid-cols-2 gap-2 max-h-[340px] overflow-y-auto">
                {holYear.length === 0 && <p className="text-sm text-muted-foreground col-span-2 py-4 text-center">No holidays for {today.slice(0, 4)}</p>}
                {holYear.map((h) => {
                  const passed = h.holiday_date < today;
                  const [, , dd] = h.holiday_date.split('-');
                  const mon = new Date(`${h.holiday_date}T00:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' });
                  return (
                    <div key={h.holiday_date} className={`flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 ${passed ? 'opacity-50' : 'border-l-2 border-l-emerald-500'}`}>
                      <div className="shrink-0 w-10 text-center rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 py-0.5">
                        <div className="text-base font-bold leading-none text-slate-800 dark:text-slate-100">{dd}</div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">{mon}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{h.name_en}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{h.name_fr}</div>
                      </div>
                      <span className="ml-auto text-[9px] font-bold uppercase rounded px-1 shrink-0 bg-blue-50 text-blue-600">{passed ? 'Done' : h.holiday_type === 'fixed' ? 'Fixed' : 'Var'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><Users className="h-4 w-4 text-violet-500" /> Client Delay Comparison</div>
            <div className="overflow-x-auto">
              <table className="table-base whitespace-nowrap text-xs">
                <thead>
                  <tr>
                    <th>Client</th><th className="text-center">Total</th><th className="text-center">Delivered</th>
                    <th className="text-center text-emerald-600">On Time</th><th className="text-center text-rose-600">Delayed</th>
                    {cfg.clientColumns.map((col) => <th key={col.alias} className="text-center">{col.header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.client_delay_table.length === 0 && <tr><td colSpan={5 + cfg.clientColumns.length} className="text-center text-muted-foreground py-6">No data available</td></tr>}
                  {data.client_delay_table.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="font-semibold text-slate-900 dark:text-slate-100">{String(r.client_name ?? '')}</td>
                      <td className="text-center font-mono">{num(Number(r[cfg.totalKey] ?? 0))}</td>
                      <td className="text-center"><span className="rounded bg-blue-50 text-blue-700 px-2 py-0.5 font-bold">{num(Number(r.delivered_count ?? 0))}</span></td>
                      <td className="text-center"><span className="rounded bg-emerald-100 text-emerald-700 px-2 py-0.5 font-bold">{num(Number(r.on_time_count ?? 0))}</span></td>
                      <td className="text-center"><span className="rounded bg-rose-100 text-rose-700 px-2 py-0.5 font-bold">{num(Number(r.delayed_count ?? 0))}</span></td>
                      {cfg.clientColumns.map((col) => <td key={col.alias} className="text-center"><DP v={r[col.alias] as number | null} th={col.threshold} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {drill && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={() => setDrill(null)}>
          <div className="card w-full max-w-6xl my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-blue-600 to-indigo-600">
              <div>
                <h2 className="font-semibold">{drill.label}</h2>
                <div className="text-xs text-white/80 mt-0.5 font-mono">{fl(drill.from)} → {fl(drill.to)}</div>
              </div>
              <button type="button" onClick={() => setDrill(null)} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap gap-2 mb-3">
                {[['', 'All'], ['on_time', 'On Time'], ['delayed', 'Delayed'], ['pending', 'Pending']].map(([v, lbl]) => (
                  <button key={v} type="button" onClick={() => { setStatusF(v); loadRecords(drill.key, v); }}
                    className={`text-xs font-semibold uppercase rounded-full px-3 py-1 border ${statusF === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>{lbl}</button>
                ))}
                <span className="ml-auto text-xs text-muted-foreground self-center">{records.length} record{records.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="overflow-x-auto max-h-[62vh]">
                {recLoading ? <div className="py-10 text-center text-muted-foreground">Loading records…</div> : (
                  <table className="table-base whitespace-nowrap text-xs">
                    <thead>
                      <tr><th className="w-6" /><th>ID</th><th>MCA Ref</th><th>Client</th><th>Clearance</th><th>{fl(drill.from)}</th><th>{fl(drill.to)}</th><th className="text-center">Total</th><th className="text-center">Working</th><th className="text-center">Delay</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {records.length === 0 && <tr><td colSpan={11} className="text-center text-muted-foreground py-6">No records found</td></tr>}
                      {records.map((r, idx) => {
                        const st = r.delay_status as string;
                        const pending = r.is_pending === 1;
                        const cls = st === 'On Time' ? 'bg-emerald-500' : st === 'Delayed' ? 'bg-rose-500' : 'bg-slate-400';
                        const dd = r.delay_days as number | null;
                        return (
                          <Fragment key={idx}>
                            <tr className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${st === 'Delayed' ? 'bg-rose-50/40 dark:bg-rose-500/5' : pending ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''}`} onClick={() => setExpanded(expanded === idx ? null : idx)}>
                            <td className="text-muted-foreground">{expanded === idx ? '▾' : '▸'}</td>
                            <td className="font-mono text-muted-foreground">{String(r.id)}</td>
                            <td><span className="font-mono font-bold text-blue-600">{String(r.mca_ref ?? '—')}</span></td>
                            <td className="font-semibold">{String(r.client_short ?? '—')}</td>
                            <td><span className="rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 text-[10px] font-bold">{String(r.clearance_name ?? '—')}</span></td>
                            <td className="font-mono">{String(r.stage_from_date ?? '—')}</td>
                            <td className="font-mono">{pending ? <span className="text-amber-600 italic">{today} →</span> : String(r.stage_to_date ?? '—')}</td>
                            <td className="text-center font-mono">{r.total_days != null ? `${r.total_days}d` : '—'}</td>
                            <td className="text-center font-mono font-bold" style={{ color: st === 'Delayed' ? '#e11d48' : st === 'On Time' ? '#059669' : '#94a3b8' }}>{r.days_taken != null ? `${d1(r.days_taken as number)}d` : '—'}</td>
                            <td className="text-center font-mono font-bold text-rose-600">{dd && dd > 0 ? `+${dd}d` : '0d'}</td>
                            <td><span className={`inline-block rounded px-2 py-0.5 text-white text-[10px] font-bold uppercase ${cls}`}>{st}</span></td>
                            </tr>
                            {expanded === idx && (
                              <tr className="bg-slate-50 dark:bg-slate-800/40">
                                <td colSpan={11} className="p-3">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-[11px]">
                                    {cfg.drillFields.map(([lbl, key, suffix]) => {
                                      const v = r[key];
                                      const disp = v == null || v === '' ? '—' : `${String(v)}${suffix ?? ''}`;
                                      return <div key={key} className="flex justify-between gap-2"><span className="text-muted-foreground">{lbl}</span><span className="font-medium text-slate-800 dark:text-slate-100 truncate">{disp}</span></div>;
                                    })}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3">
              <button type="button" disabled title="Excel export — coming in the next pass" className="btn-excel btn-sm"><Download className="h-4 w-4" /> Export</button>
              <button type="button" onClick={() => setDrill(null)} className="btn-secondary"><X className="h-4 w-4" /> Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
