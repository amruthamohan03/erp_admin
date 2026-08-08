'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Layers, Search, Filter, Eye, Edit2, X, Check, FileText, FileSpreadsheet, Info,
} from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { clientOptionLabel } from '@/lib/clientOptions';

// Bivac / PARTIELLE Management — import licences (kind 1,2) split into named
// PARTIELLE allocations, tracked against usage from imports. Ported from main's
// /bivac; balances are computed server-side (see src/db/queries/bivac.ts).

interface LicenseRow {
  id: number;
  license_number: string | null;
  ref_cod: string | null;
  client_name: string | null;
  currency_name: string | null;
  type_of_goods_name: string | null;
  weight: number;
  fob_declared: number;
  insurance: number;
  freight: number;
  other_costs: number;
  partielle_count: number;
  total_used_weight: number;
  total_used_fob: number;
  balance_weight: number;
  balance_fob: number;
}

interface PartialRow {
  id: number;
  partial_name: string;
  partial_weight: number;
  partial_fob: number;
  partial_insurance: number;
  partial_freight: number;
  partial_other_costs: number;
  used_weight: number;
  used_fob: number;
  remaining_weight: number;
  remaining_fob: number;
  import_count: number;
}

interface FileRow {
  id: number;
  mca_ref: string | null;
  inspection_reports: string | null;
  declaration_reference: string | null;
  dgda_in_date: string | null;
  liquidation_reference: string | null;
  liquidation_date: string | null;
  quittance_reference: string | null;
  quittance_date: string | null;
  weight: string | null;
  fob: string | null;
}

const HERO = 'bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-700';

function fmt(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : n ?? 0;
  return (Number.isFinite(v) ? (v as number) : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}
function fmtDate(d: string | null): string {
  if (!d) return '-';
  const [y, m, day] = d.slice(0, 10).split('-');
  return y && m && day ? `${day}-${m}-${y}` : d;
}

export default function BivacPage() {
  // ---- Licences table (server-side) ----
  const [items, setItems] = useState<LicenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('0');
  const [clientOpts, setClientOpts] = useState<Array<{ id: number; short_name: string | null }>>([]);
  const [loading, setLoading] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // ---- Drill-downs ----
  const [viewLicense, setViewLicense] = useState<LicenseRow | null>(null);
  const [partials, setPartials] = useState<PartialRow[] | null>(null);
  const [partialsLoading, setPartialsLoading] = useState(false);

  const [viewPartial, setViewPartial] = useState<PartialRow | null>(null);
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);

  // ---- Edit form ----
  const [edit, setEdit] = useState<PartialRow | null>(null);
  const [form, setForm] = useState({ w: '', f: '', i: '', fr: '', o: '' });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search.trim()) p.set('q', search.trim());
      if (clientFilter !== '0') p.set('client_id', clientFilter);
      const res = await fetch(`/api/v1/bivac/licenses?${p}`);
      const j = await res.json();
      if (j.ok) { setItems(j.data); setTotal(j.meta?.total ?? 0); }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, clientFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/bivac/clients')
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.ok) setClientOpts(j.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function openPartials(lic: LicenseRow) {
    setViewLicense(lic);
    setViewPartial(null);
    setFiles(null);
    setPartials(null);
    setPartialsLoading(true);
    try {
      const res = await fetch(`/api/v1/bivac/licenses/${lic.id}/partials`);
      const j = await res.json();
      setPartials(j.ok ? j.data : []);
    } finally {
      setPartialsLoading(false);
    }
  }

  async function openFiles(p: PartialRow) {
    setViewPartial(p);
    setFiles(null);
    setFilesLoading(true);
    try {
      const res = await fetch(`/api/v1/bivac/partials/${p.id}/files`);
      const j = await res.json();
      setFiles(j.ok ? j.data : []);
    } finally {
      setFilesLoading(false);
    }
  }

  function openEdit(p: PartialRow) {
    setEdit(p);
    setEditError(null);
    setForm({
      w: String(p.partial_weight), f: String(p.partial_fob), i: String(p.partial_insurance),
      fr: String(p.partial_freight), o: String(p.partial_other_costs),
    });
  }

  async function saveEdit() {
    if (!edit) return;
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/v1/bivac/partials/${edit.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partial_weight: Number(form.w) || 0, partial_fob: Number(form.f) || 0,
          partial_insurance: Number(form.i) || 0, partial_freight: Number(form.fr) || 0,
          partial_other_costs: Number(form.o) || 0,
        }),
      });
      const j = await res.json();
      if (!j.ok) { setEditError(j.error?.message ?? 'Update failed'); return; }
      setEdit(null);
      if (viewLicense) await openPartials(viewLicense);
      load();
    } finally {
      setSaving(false);
    }
  }

  // Client-side rollups for the PARTIELLE summary bar (like main's JS).
  const totals = useMemo(() => {
    const t = { av_w: 0, av_f: 0, av_i: 0, av_fr: 0, av_o: 0, used_w: 0, used_f: 0, rem_w: 0, rem_f: 0, files: 0 };
    for (const p of partials ?? []) {
      t.av_w += p.partial_weight; t.av_f += p.partial_fob; t.av_i += p.partial_insurance;
      t.av_fr += p.partial_freight; t.av_o += p.partial_other_costs;
      t.used_w += p.used_weight; t.used_f += p.used_fob;
      t.rem_w += p.remaining_weight; t.rem_f += p.remaining_fob; t.files += p.import_count;
    }
    return t;
  }, [partials]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  // Live edit calculations.
  const licW = edit && viewLicense ? viewLicense.weight : 0;
  const licF = edit && viewLicense ? viewLicense.fob_declared : 0;
  const avW = Number(form.w) || 0, avF = Number(form.f) || 0;

  return (
    <>
      {/* Hero */}
      <div className="card overflow-hidden mb-4">
        <div className={`h-1 w-full ${HERO}`} />
        <div className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl text-white ${HERO}`}>
              <Layers className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">PARTIELLE Management</h1>
              <p className="text-sm text-slate-500">Import-licence allocation & usage tracking (Bivac)</p>
            </div>
          </div>
          <button
            type="button" disabled title="Excel export — coming in the next pass"
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-200 text-slate-400 px-3 py-2 text-sm font-medium cursor-not-allowed dark:bg-slate-800"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </button>
        </div>
      </div>

      {/* Filter + list */}
      <div className="card">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary-600" />
            <label htmlFor="clientFilter" className="text-sm font-medium text-slate-700 dark:text-slate-300">Client</label>
            <select
              id="clientFilter" className="input py-1 px-2 text-sm w-52"
              value={clientFilter}
              onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}
            >
              <option value="0">All Clients</option>
              {/* Short code, per the app-wide client label rule (§4.15). */}
              {clientOpts.map((c) => (<option key={c.id} value={c.id}>{clientOptionLabel(c)}</option>))}
            </select>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9 text-sm w-64"
              placeholder="Search licence, CRF, client, currency, goods…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base whitespace-nowrap">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Licence #</th>
                <th>CRF</th>
                <th className="text-center">PARTIELLE</th>
                <th>Client</th>
                <th>Currency</th>
                <th>Type of Goods</th>
                <th className="text-right">FOB</th>
                <th className="text-right">Freight</th>
                <th className="text-right">Insurance</th>
                <th className="text-right">Other</th>
                <th className="text-right">Weight</th>
                <th className="text-right">Bal. Wt</th>
                <th className="text-right">Bal. FOB</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={14} className="text-center text-slate-500 py-8">Loading…</td></tr>)}
              {!loading && items.length === 0 && (
                <tr><td colSpan={14} className="text-center text-slate-500 py-8">No import licences found.</td></tr>
              )}
              {!loading && items.map((l, idx) => (
                <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-mono text-xs font-medium">{l.license_number || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-600 text-xs">{l.ref_cod || <span className="text-slate-300">—</span>}</td>
                  <td className="text-center">
                    {l.partielle_count > 0 ? (
                      <button
                        type="button" onClick={() => openPartials(l)}
                        title="View PARTIELLE"
                        className={`inline-flex min-w-[2rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold text-white ${HERO} hover:brightness-110`}
                      >
                        {l.partielle_count}
                      </button>
                    ) : (
                      <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold bg-slate-100 text-slate-400 dark:bg-slate-800">0</span>
                    )}
                  </td>
                  <td className="font-medium">{l.client_name || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-600 text-xs">{l.currency_name || '—'}</td>
                  <td className="text-slate-600 text-xs">{l.type_of_goods_name || '—'}</td>
                  <td className="text-right tabular-nums text-xs">{fmt(l.fob_declared)}</td>
                  <td className="text-right tabular-nums text-xs">{fmt(l.freight)}</td>
                  <td className="text-right tabular-nums text-xs">{fmt(l.insurance)}</td>
                  <td className="text-right tabular-nums text-xs">{fmt(l.other_costs)}</td>
                  <td className="text-right tabular-nums text-xs">{fmt(l.weight)} KG</td>
                  <td className="text-right tabular-nums text-xs font-semibold text-emerald-700 dark:text-emerald-400">{fmt(l.balance_weight)} KG</td>
                  <td className="text-right tabular-nums text-xs font-semibold text-emerald-700 dark:text-emerald-400">{fmt(l.balance_fob)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          page={page} setPage={setPage} pageSize={pageSize}
          setPageSize={(n) => { setPageSize(n); setPage(1); }}
          totalRows={total} totalPages={totalPages} startIndex={startIndex} mounted={mounted}
        />
      </div>

      {/* ---- PARTIELLE drill-down ---- */}
      {viewLicense && (
        <div className="card overflow-hidden mt-5">
          <div className={`flex items-center justify-between px-4 py-3 text-white ${HERO}`}>
            <h2 className="font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" /> PARTIELLE for licence {viewLicense.license_number}
            </h2>
            <button type="button" onClick={() => { setViewLicense(null); setViewPartial(null); }} className="rounded-md p-1 hover:bg-white/20">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-4">
            {/* Summary bar */}
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                ['CRF', viewLicense.ref_cod ?? 'N/A'], ['Client', viewLicense.client_name ?? 'N/A'],
                ['AV Wt', `${fmt(totals.av_w)} KG`], ['AV FOB', fmt(totals.av_f)],
                ['AV Frt', fmt(totals.av_fr)], ['AV Ins', fmt(totals.av_i)], ['AV Other', fmt(totals.av_o)],
                ['Used Wt', `${fmt(totals.used_w)} KG`], ['Used FOB', fmt(totals.used_f)],
                ['Rem Wt', `${fmt(totals.rem_w)} KG`], ['Rem FOB', fmt(totals.rem_f)],
                ['Lic Wt − ΣAV', `${fmt(viewLicense.weight - totals.av_w)} KG`],
                ['Lic FOB − ΣAV', fmt(viewLicense.fob_declared - totals.av_f)],
                ['Files', String(totals.files)],
              ].map(([label, val]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{val}</div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="table-base whitespace-nowrap">
                <thead>
                  <tr>
                    <th>PARTIELLE</th>
                    <th className="text-right">AV Weight</th>
                    <th className="text-right">AV FOB</th>
                    <th className="text-right">Used Wt</th>
                    <th className="text-right">Used FOB</th>
                    <th className="text-right">Rem Wt</th>
                    <th className="text-right">Rem FOB</th>
                    <th className="text-center">Files</th>
                    <th className="text-center">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {partialsLoading && (<tr><td colSpan={9} className="text-center text-slate-500 py-6">Loading…</td></tr>)}
                  {!partialsLoading && partials?.length === 0 && (
                    <tr><td colSpan={9} className="text-center text-slate-500 py-6">No PARTIELLE for this licence.</td></tr>
                  )}
                  {!partialsLoading && partials?.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="font-medium">{p.partial_name}</td>
                      <td className="text-right tabular-nums text-xs">{fmt(p.partial_weight)} KG</td>
                      <td className="text-right tabular-nums text-xs">{fmt(p.partial_fob)}</td>
                      <td className="text-right tabular-nums text-xs">{fmt(p.used_weight)} KG</td>
                      <td className="text-right tabular-nums text-xs">{fmt(p.used_fob)}</td>
                      <td className="text-right tabular-nums text-xs">{fmt(p.remaining_weight)} KG</td>
                      <td className="text-right tabular-nums text-xs">{fmt(p.remaining_fob)}</td>
                      <td className="text-center">
                        {p.import_count > 0 ? (
                          <button type="button" onClick={() => openFiles(p)} title="View files"
                            className="inline-flex min-w-[2rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold bg-amber-500 text-white hover:bg-amber-600">
                            {p.import_count}
                          </button>
                        ) : (<span className="text-slate-300 text-xs">0</span>)}
                      </td>
                      <td className="text-center">
                        <button type="button" onClick={() => openEdit(p)} title="Edit allocation"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary-600 hover:bg-primary-700 text-white">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---- Files drill-down ---- */}
      {viewPartial && (
        <div className="card overflow-hidden mt-5">
          <div className="flex items-center justify-between px-4 py-3 text-white bg-gradient-to-r from-amber-500 to-orange-600">
            <h2 className="font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" /> Import files for {viewPartial.partial_name}
            </h2>
            <button type="button" onClick={() => setViewPartial(null)} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="table-base whitespace-nowrap">
              <thead>
                <tr>
                  <th className="w-10">#</th><th>MCA Ref</th><th>Inspection</th><th>Declaration</th>
                  <th>DGDA In</th><th>Liquidation Ref</th><th>Liq. Date</th><th>Quittance Ref</th>
                  <th>Quit. Date</th><th className="text-right">Weight</th><th className="text-right">FOB</th>
                </tr>
              </thead>
              <tbody>
                {filesLoading && (<tr><td colSpan={11} className="text-center text-slate-500 py-6">Loading…</td></tr>)}
                {!filesLoading && files?.length === 0 && (<tr><td colSpan={11} className="text-center text-slate-500 py-6">No import files.</td></tr>)}
                {!filesLoading && files?.map((f, i) => (
                  <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs">
                    <td className="text-slate-500">{i + 1}</td>
                    <td className="font-mono">{f.mca_ref || '—'}</td>
                    <td>{f.inspection_reports || '—'}</td>
                    <td>{f.declaration_reference || '—'}</td>
                    <td>{fmtDate(f.dgda_in_date)}</td>
                    <td>{f.liquidation_reference || '—'}</td>
                    <td>{fmtDate(f.liquidation_date)}</td>
                    <td>{f.quittance_reference || '—'}</td>
                    <td>{fmtDate(f.quittance_date)}</td>
                    <td className="text-right tabular-nums font-semibold">{fmt(f.weight)} KG</td>
                    <td className="text-right tabular-nums font-semibold">{fmt(f.fob)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Edit modal ---- */}
      {edit && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 sm:p-8 overflow-y-auto" onClick={() => setEdit(null)}>
          <div className="card w-full max-w-3xl my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-violet-500 to-purple-600">
              <h2 className="font-semibold flex items-center gap-2"><Edit2 className="h-5 w-5" /> Edit allocation — {edit.partial_name}</h2>
              <button type="button" onClick={() => setEdit(null)} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5">
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Only the <strong>AV Allocation</strong> amounts are editable. Used and calculated figures come from linked imports. Total allocation cannot exceed the licence capacity.</span>
              </div>

              {editError && (
                <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">{editError}</div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {([
                  ['AV Weight', 'w'], ['AV FOB', 'f'], ['AV Insurance', 'i'], ['AV Freight', 'fr'], ['AV Other', 'o'],
                ] as const).map(([label, key]) => (
                  <div key={key}>
                    <label className="label">{label}</label>
                    <input
                      type="number" step="0.01" min="0" className="input"
                      value={form[key]}
                      onChange={(e) => setForm((s) => ({ ...s, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>

              {/* Readonly computed context */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {[
                  ['Licence Weight', `${fmt(licW)} KG`], ['Licence FOB', fmt(licF)],
                  ['Used Weight', `${fmt(edit.used_weight)} KG`], ['Used FOB', fmt(edit.used_fob)],
                  ['Lic Wt − AV', `${fmt(licW - avW)} KG`], ['Lic FOB − AV', fmt(licF - avF)],
                  ['AV − Used Wt', `${fmt(avW - edit.used_weight)} KG`], ['AV − Used FOB', fmt(avF - edit.used_fob)],
                ].map(([label, val]) => (
                  <div key={label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/40">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div>
                    <div className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{val}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3">
              <button type="button" onClick={() => setEdit(null)} className="btn-secondary"><X className="h-4 w-4" /> Cancel</button>
              <button type="button" onClick={saveEdit} disabled={saving} className="btn-primary">
                <Check className="h-4 w-4" /> {saving ? 'Saving…' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
