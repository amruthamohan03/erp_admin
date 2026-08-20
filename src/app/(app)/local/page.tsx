'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Eye, Edit2, Trash2, Truck, MapPin, X } from 'lucide-react';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import DataTable from '@/components/ui/DataTable';
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

      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        title="Locals List"
        searchPlaceholder="Search reference, horse, transporter, client…"
        emptyMessage="No local tracking records yet — create the first one."
        columns={[
          { key: 'client_name', header: 'Client', className: 'font-medium' },
          { key: 'location_name', header: 'Location' },
          { key: 'mca_lt_reference', header: 'MCA LT Reference', className: 'font-mono' },
          { key: 'lot_num', header: 'Lot Num' },
          { key: 'horse', header: 'Horse' },
          { key: 'transporter', header: 'Transporter' },
          { key: 'arrival_date', header: 'Arrival', render: (r: Row) => fmtDate(r.arrival_date) },
        ]}
        actions={(r) => ({
          view: () => openView(r.id),
          edit: `/local/${r.id}`,
          remove: () => del(r.id),
        })}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
          search,
          onSearchChange: (q) => { setSearch(q); setPage(1); },
        }}
      />

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
