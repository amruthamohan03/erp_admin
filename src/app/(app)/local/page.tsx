'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Eye, Edit2, Trash2, Truck, MapPin, X } from 'lucide-react';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { formatDate as fmtDate } from '@/lib/formatDate';

// Local Tracking list. The create/edit form is a transaction-page
// (/local/new, /local/[id]); this page owns the stat cards (total + per-office
// filters), the server-side list, and view/delete.

interface Row {
  id: number;
  client_name: string | null;
  location_name: string | null;
  location_id: number | null;
  mca_lt_reference: string | null;
  lot_num: string | null;
  horse: string | null;
  transporter: string | null;
  arrival_date: string | null;
}

interface Stats {
  total_tracking: number;
  location_counts: Array<{ id: number; main_location_name: string; file_count: number }>;
}

const OFFICE_GRAD: Record<number, string> = {
  1: 'from-rose-500 to-pink-600',
  2: 'from-sky-500 to-blue-600',
  4: 'from-emerald-500 to-teal-600',
};


export default function LocalPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState(0);
  const [loading, setLoading] = useState(false);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const [view, setView] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize), location_filter: String(locationFilter) });
      if (search.trim()) p.set('q', search.trim());
      const res = await fetch(`/api/v1/locals?${p}`);
      const j = await res.json();
      if (j.ok) { setItems(j.data); setTotal(j.meta?.total ?? 0); }
    } finally { setLoading(false); }
  }, [page, pageSize, locationFilter, search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const loadStats = useCallback(() => {
    fetch('/api/v1/locals/statistics').then((r) => r.json()).then((j) => { if (j.ok) setStats(j.data); }).catch(() => {});
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  async function openView(id: number) {
    setView(null);
    const res = await fetch(`/api/v1/locals/${id}`);
    const j = await res.json();
    if (j.ok) setView(j.data);
  }

  async function del(id: number) {
    if (!confirm('Delete this local tracking record?')) return;
    const res = await fetch(`/api/v1/locals/${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!j.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: j.error?.message || 'This tracking record could not be deleted.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The local tracking record has been deleted.' });
    load(); loadStats();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  const D = (k: string) => { const v = view?.[k]; return v === null || v === undefined || v === '' ? '—' : String(v); };
  const Ddate = (k: string) => fmtDate((view?.[k] as string) ?? null);

  return (
    <>
      <div className="card overflow-hidden mb-4">
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600" />
        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary-600" /> Local Tracking
          </h1>
          <Link href="/local/new" className="btn-primary"><Plus className="h-4 w-4" /> Add New Local</Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <button type="button" onClick={() => { setLocationFilter(0); setPage(1); }}
          className={`text-left rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white p-4 shadow-sm transition hover:shadow-md ${locationFilter === 0 ? 'ring-2 ring-offset-2 ring-slate-900/40' : ''}`}>
          <div className="text-2xl font-bold">{stats?.total_tracking ?? 0}</div>
          <div className="text-[11px] mt-1 opacity-90 uppercase tracking-wide">Total Tracking</div>
        </button>
        {(stats?.location_counts ?? []).map((loc) => (
          <button key={loc.id} type="button" onClick={() => { setLocationFilter(loc.id); setPage(1); }}
            className={`text-left rounded-xl bg-gradient-to-br ${OFFICE_GRAD[loc.id] ?? 'from-slate-500 to-slate-700'} text-white p-4 shadow-sm transition hover:shadow-md ${locationFilter === loc.id ? 'ring-2 ring-offset-2 ring-slate-900/40' : ''}`}>
            <div className="text-2xl font-bold flex items-center gap-1"><MapPin className="h-4 w-4 opacity-70" />{loc.file_count}</div>
            <div className="text-[11px] mt-1 opacity-90 uppercase tracking-wide truncate">{loc.main_location_name}</div>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Locals List</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className="input pl-9 text-sm w-64" placeholder="Search reference, horse, transporter, client…"
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base whitespace-nowrap">
            <thead>
              <tr>
                <th className="w-12">#</th><th>Client</th><th>Location</th><th>MCA LT Reference</th>
                <th>Lot Num</th><th>Horse</th><th>Transporter</th><th>Arrival</th><th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={9} className="text-center text-muted-foreground py-8">Loading…</td></tr>)}
              {!loading && items.length === 0 && (<tr><td colSpan={9} className="text-center text-muted-foreground py-8">No local records found.</td></tr>)}
              {!loading && items.map((r, idx) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs">
                  <td className="text-muted-foreground font-medium">{startIndex + idx + 1}</td>
                  <td className="font-medium">{r.client_name || 'N/A'}</td>
                  <td>{r.location_name || 'N/A'}</td>
                  <td className="font-mono">{r.mca_lt_reference || '—'}</td>
                  <td>{r.lot_num || '—'}</td>
                  <td>{r.horse || '—'}</td>
                  <td>{r.transporter || '—'}</td>
                  <td>{fmtDate(r.arrival_date)}</td>
                  <td>
                    <div className="inline-flex items-center gap-1 justify-center">
                      <button type="button" onClick={() => openView(r.id)} title="View" className="btn-view btn-icon"><Eye className="h-3.5 w-3.5" /></button>
                      <Link href={`/local/${r.id}`} title="Edit" className="btn-edit btn-icon"><Edit2 className="h-3.5 w-3.5" /></Link>
                      <button type="button" onClick={() => del(r.id)} title="Delete" className="btn-delete btn-icon"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationFooter page={page} setPage={setPage} pageSize={pageSize}
          setPageSize={(n) => { setPageSize(n); setPage(1); }}
          totalRows={total} totalPages={totalPages} startIndex={startIndex} mounted={mounted} />
      </div>

      {/* View modal */}
      {view && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 sm:p-8 overflow-y-auto" onClick={() => setView(null)}>
          <div className="card w-full max-w-3xl my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-indigo-500 to-purple-600">
              <h2 className="font-semibold flex items-center gap-2"><Eye className="h-5 w-5" /> Local #{String(view.id)} — {D('mca_lt_reference')}</h2>
              <button type="button" onClick={() => setView(null)} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 max-h-[72vh] overflow-y-auto">
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                {([
                  ['Client', D('client_name')], ['Location', D('location_name')], ['MCA LT Reference', D('mca_lt_reference')],
                  ['Lot Num', D('lot_num')], ['Horse', D('horse')], ['Trailer 1', D('trailer_1')],
                  ['Trailer 2', D('trailer_2')], ['Transporter', D('transporter')], ['Nbr of Bags', D('nbr_of_bags')],
                  ['Weight (T)', D('weight')], ['Arrival Date', Ddate('arrival_date')], ['Loading Date', Ddate('loading_date')],
                  ['BP Details Received', Ddate('bp_details_received_date')], ['PV Div Mines', Ddate('pv_div_mines_date')], ["Demande d'Attestation", Ddate('demande_attestation_date')],
                  ['CEEC In', Ddate('ceec_in')], ['CEEC Out', Ddate('ceec_out')], ['CGEA', D('cgea')],
                  ['Gov Docs Complete', Ddate('gov_docs_complete_date')], ['Disp Date', Ddate('disp_date')], ['End of Formalities', Ddate('end_of_formalities')],
                ] as Array<[string, string]>).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{k}</dt>
                    <dd className="text-slate-800 dark:text-slate-100">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Remarks</div>
                <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-2 text-sm whitespace-pre-wrap">{D('remarks')}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3">
              <Link href={`/local/${view.id}`} className="btn-primary"><Edit2 className="h-4 w-4" /> Edit</Link>
              <button type="button" onClick={() => setView(null)} className="btn-secondary"><X className="h-4 w-4" /> Close</button>
            </div>
          </div>
        </div>
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
