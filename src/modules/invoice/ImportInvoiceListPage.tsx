'use client';

// §2 step 5 — Import Invoice list (ports the legacy importinvoice.php list). 7
// stat cards (6 are clickable AND-style filters; "Pending for Invoicing" is a
// count only — its management modal is deferred), search + created-at date range,
// the three Excel exports, and every row action: Print (HTML→PDF), Edit,
// Validate, Mark DGI-Verified, DGI-Edit, Delete.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Search, Edit2, Trash2, CheckCircle2, Check, FileText, X, Printer, FileSpreadsheet,
  FileCheck, FilePlus2, Loader2, Clock, AlertTriangle, ShieldCheck,
} from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import PaginationFooter from '@/components/ui/PaginationFooter';

interface Row {
  id: number;
  invoice_ref: string | null;
  client_id: number | null;
  client_name: string | null;
  type_of_goods: string | null;
  created_at: string | null;
  created_by_name: string | null;
  amount: number;
  validated: number;
  tally_ref: string | null;
  dgi_amount: number;
  normalized_by: number | null;
}

interface Stats {
  total: number;
  validated: number;
  not_validated: number;
  dgi_verified: number;
  dgi_complete: number;
  dgi_incomplete: number;
  pending_invoicing: number;
}

type FilterKey = 'all' | 'validated' | 'not-validated' | 'dgi-verified' | 'dgi-complete' | 'dgi-incomplete';

const CARDS: Array<{ key: string; label: string; grad: string; stat: keyof Stats; filter?: FilterKey }> = [
  { key: 'pending_invoicing', label: 'Pending for Invoicing', grad: 'from-sky-500 to-blue-600', stat: 'pending_invoicing' },
  { key: 'validated', label: 'Validated', grad: 'from-emerald-500 to-teal-600', stat: 'validated', filter: 'validated' },
  { key: 'not-validated', label: 'Not Validated', grad: 'from-amber-500 to-orange-500', stat: 'not_validated', filter: 'not-validated' },
  { key: 'dgi-verified', label: 'DGI Verified', grad: 'from-red-800 to-red-600', stat: 'dgi_verified', filter: 'dgi-verified' },
  { key: 'all', label: 'Total Invoices', grad: 'from-indigo-500 to-violet-600', stat: 'total', filter: 'all' },
  { key: 'dgi-complete', label: 'DGI Complete', grad: 'from-green-600 to-emerald-700', stat: 'dgi_complete', filter: 'dgi-complete' },
  { key: 'dgi-incomplete', label: 'DGI Incomplete', grad: 'from-rose-500 to-red-600', stat: 'dgi_incomplete', filter: 'dgi-incomplete' },
];

const fmt = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function dgiComplete(r: Row): boolean {
  return !!r.tally_ref && r.tally_ref.trim() !== '' && r.dgi_amount > 0 && !!r.normalized_by && r.normalized_by > 0;
}
function statusOf(r: Row): { label: string; cls: string } {
  if (r.validated === 2 || dgiComplete(r)) return { label: 'DGI VERIFIED', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  if (r.validated === 1) return { label: 'VALIDATED', cls: 'bg-sky-100 text-sky-800 border-sky-200' };
  return { label: 'NOT VALIDATED', cls: 'bg-rose-100 text-rose-800 border-rose-200' };
}

export default function ImportInvoiceListPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({ total: 0, validated: 0, not_validated: 0, dgi_verified: 0, dgi_complete: 0, dgi_incomplete: 0, pending_invoicing: 0 });
  const [norms, setNorms] = useState<{ id: number; full_name: string }[]>([]);

  const [confirm, setConfirm] = useState<{ row: Row; action: 'validate' | 'dgi' | 'delete' } | null>(null);
  const [dgiEdit, setDgiEdit] = useState<Row | null>(null);
  const [dgiForm, setDgiForm] = useState({ tally_ref: '', dgi_amount: '', normalized_by: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize), filter });
      if (search.trim()) p.set('q', search.trim());
      if (dateFrom) p.set('date_from', dateFrom);
      if (dateTo) p.set('date_to', dateTo);
      const j = await fetch(`/api/v1/import-invoices?${p}`).then((r) => r.json());
      if (j.ok) {
        setItems(j.data);
        setTotal(j.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filter, search, dateFrom, dateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const loadStats = useCallback(() => {
    fetch('/api/v1/import-invoices/statistics').then((r) => r.json()).then((j) => { if (j.ok) setStats(j.data); }).catch(() => {});
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    fetch('/api/v1/import-invoices/normalizers').then((r) => r.json()).then((j) => { if (j.ok) setNorms(j.data); }).catch(() => {});
  }, []);

  function exportProfile(profile: 'debit' | 'invoice' | 'full') {
    const p = new URLSearchParams({ profile });
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo) p.set('date_to', dateTo);
    window.location.assign(`/api/v1/import-invoices/export?${p}`);
  }

  async function runAction() {
    if (!confirm) return;
    setBusy(true);
    setErr(null);
    try {
      const { row, action } = confirm;
      const res = action === 'delete'
        ? await fetch(`/api/v1/import-invoices/${row.id}`, { method: 'DELETE' })
        : await fetch(`/api/v1/import-invoices/${row.id}/validate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ validated: action === 'dgi' ? 2 : 1 }),
          });
      const j = await res.json();
      if (!j.ok) { setErr(j.error?.message ?? 'Action failed'); return; }
      setConfirm(null);
      load();
      loadStats();
    } finally {
      setBusy(false);
    }
  }

  function openDgiEdit(row: Row) {
    setDgiEdit(row);
    setDgiForm({
      tally_ref: row.tally_ref ?? '',
      dgi_amount: row.dgi_amount ? String(row.dgi_amount) : '',
      normalized_by: row.normalized_by ? String(row.normalized_by) : '',
    });
    setErr(null);
  }
  async function saveDgiEdit() {
    if (!dgiEdit) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v1/import-invoices/${dgiEdit.id}/dgi`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tally_ref: dgiForm.tally_ref.trim() || null,
          dgi_amount: Number(dgiForm.dgi_amount) || 0,
          normalized_by: dgiForm.normalized_by ? Number(dgiForm.normalized_by) : null,
        }),
      });
      const j = await res.json();
      if (!j.ok) { setErr(j.error?.message ?? 'Save failed'); return; }
      setDgiEdit(null);
      load();
      loadStats();
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <>
      <div className="card overflow-hidden mb-4">
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600" />
        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary-600" /> Import Invoices
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => exportProfile('debit')} className="btn-excel btn-sm">
              <FileSpreadsheet className="h-4 w-4" /> Debit Note
            </button>
            <button type="button" onClick={() => exportProfile('invoice')} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-sm font-medium">
              <FileCheck className="h-4 w-4" /> Invoice
            </button>
            <button type="button" onClick={() => exportProfile('full')} className="btn-excel btn-sm">
              <FilePlus2 className="h-4 w-4" /> Full Export
            </button>
            <Link href="/import-invoices/new" className="btn-primary"><Plus className="h-4 w-4" /> New Invoice</Link>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
        {CARDS.map((card) => {
          const clickable = !!card.filter;
          const active = clickable && filter === card.filter;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => { if (card.filter) { setFilter(card.filter); setPage(1); } }}
              className={`relative text-left rounded-xl bg-gradient-to-br ${card.grad} text-white p-3 shadow-sm transition hover:shadow-md ${active ? 'ring-2 ring-offset-2 ring-slate-900/40' : ''} ${clickable ? '' : 'cursor-default'}`}
              title={clickable ? `Filter: ${card.label}` : `${card.label} (management view deferred)`}
            >
              {active && (
                <span className="absolute right-2 top-2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-white text-slate-900 shadow">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              )}
              <div className="text-2xl font-bold leading-none">{stats[card.stat]}</div>
              <div className="text-[11px] mt-1 opacity-90 uppercase tracking-wide">{card.label}</div>
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <span className="font-semibold text-slate-800">Import Invoices List</span>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className="input py-1 text-xs w-36" value={dateFrom} max={dateTo || undefined}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} title="From date" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" className="input py-1 text-xs w-36" value={dateTo} min={dateFrom || undefined}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }} title="To date" />
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input className="input pl-9 text-sm w-56" placeholder="Search ref, client, MCA…"
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base whitespace-nowrap">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Invoice Ref</th>
                <th>Client</th>
                <th>Type of Goods</th>
                <th>Invoice Date</th>
                <th>Created By</th>
                <th className="text-right">Amount</th>
                <th>Validation</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">Loading…</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">No invoices found.</td></tr>}
              {!loading && items.map((r, idx) => {
                const st = statusOf(r);
                const complete = dgiComplete(r);
                return (
                  <tr key={r.id} className="hover:bg-slate-50 text-xs">
                    <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                    <td className="font-medium">{r.invoice_ref || '—'}</td>
                    <td>{r.client_name || 'N/A'}</td>
                    <td className="text-slate-600">{r.type_of_goods || '—'}</td>
                    <td className="text-slate-600">{r.created_at || '—'}</td>
                    <td className="text-slate-600">{r.created_by_name || '—'}</td>
                    <td className="text-right tabular-nums font-semibold">${fmt(r.amount)}</td>
                    <td><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span></td>
                    <td>
                      <div className="inline-flex items-center gap-1 justify-center">
                        <button type="button" title="Print / PDF" onClick={() => window.open(`/api/v1/import-invoices/${r.id}/print`, '_blank')}
                          className="btn-pdf btn-icon"><Printer className="h-3.5 w-3.5" /></button>
                        <Link href={`/import-invoices/${r.id}`} title="Edit"
                          className="btn-edit btn-icon"><Edit2 className="h-3.5 w-3.5" /></Link>
                        {r.validated === 0 && (
                          <button type="button" title="Validate" onClick={() => setConfirm({ row: r, action: 'validate' })}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                        )}
                        {r.validated === 1 && (
                          <button type="button" title="Mark DGI Verified" onClick={() => setConfirm({ row: r, action: 'dgi' })}
                            className="btn-icon bg-violet-600 text-white shadow-sm hover:bg-violet-700"><ShieldCheck className="h-3.5 w-3.5" /></button>
                        )}
                        <button type="button" title={complete ? 'DGI info complete — edit' : 'Edit DGI info (incomplete)'} onClick={() => openDgiEdit(r)}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-white ${complete ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-500 hover:bg-red-600'}`}>
                          {complete ? <FileCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                        </button>
                        {r.validated === 0 && (
                          <button type="button" title="Delete" onClick={() => setConfirm({ row: r, action: 'delete' })}
                            className="btn-delete btn-icon"><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <PaginationFooter page={page} setPage={setPage} pageSize={pageSize}
          setPageSize={(n) => { setPageSize(n); setPage(1); }}
          totalRows={total} totalPages={totalPages} startIndex={startIndex} mounted={mounted} />
      </div>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 sm:p-8 overflow-y-auto" onClick={() => setConfirm(null)}>
          <div className="card w-full max-w-md my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-violet-500 to-purple-600">
              <h2 className="font-semibold">Confirm — Invoice #{confirm.row.id}</h2>
              <button type="button" onClick={() => setConfirm(null)} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              {err && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
              <p className="text-sm text-slate-600">
                {confirm.action === 'delete' ? 'Delete this invoice? It will be hidden from the list.'
                  : confirm.action === 'dgi' ? 'Mark this invoice as DGI-verified?'
                  : 'Validate this invoice? This removes the PDF watermark.'}
              </p>
              <div className="text-sm text-muted-foreground">{confirm.row.invoice_ref || '—'} · {confirm.row.client_name || 'N/A'} · ${fmt(confirm.row.amount)}</div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={() => setConfirm(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={runAction} disabled={busy} className={confirm.action === 'delete' ? 'btn-danger' : 'btn-primary'}>
                {busy ? '…' : confirm.action === 'delete' ? 'Delete' : confirm.action === 'dgi' ? 'Mark DGI' : 'Validate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DGI edit modal */}
      {dgiEdit && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 sm:p-8 overflow-y-auto" onClick={() => setDgiEdit(null)}>
          <div className="card w-full max-w-md my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-rose-600 to-red-700">
              <h2 className="font-semibold flex items-center gap-2"><Clock className="h-5 w-5" /> Edit DGI Info</h2>
              <button type="button" onClick={() => setDgiEdit(null)} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              {err && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
              <div>
                <label className="label">Invoice Ref</label>
                <input className="input bg-slate-100" value={dgiEdit.invoice_ref ?? ''} readOnly />
              </div>
              <div>
                <label className="label">DGI Code</label>
                <input className="input" value={dgiForm.tally_ref} maxLength={100} placeholder="Enter DGI Code"
                  onChange={(e) => setDgiForm((f) => ({ ...f, tally_ref: e.target.value }))} />
              </div>
              <div>
                <label className="label">DGI Amount</label>
                <input type="number" step="0.01" min="0" className="input" value={dgiForm.dgi_amount} placeholder="0.00"
                  onChange={(e) => setDgiForm((f) => ({ ...f, dgi_amount: e.target.value }))} />
              </div>
              <div>
                <label className="label">Normalized By</label>
                <SearchableSelect
                  value={dgiForm.normalized_by}
                  emptyLabel="-- Select User --"
                  placeholder="-- Select User --"
                  options={norms.map((n) => ({ value: String(n.id), label: n.full_name }))}
                  onChange={(v) => setDgiForm((f) => ({ ...f, normalized_by: v }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={() => setDgiEdit(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={saveDgiEdit} disabled={busy} className="btn-primary inline-flex items-center gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
