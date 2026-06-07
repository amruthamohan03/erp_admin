'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Plus, Search, Edit2, Filter, Check, X, Truck,
  Boxes, CheckCircle2, Activity, FileX, CalendarX, ShieldAlert,
  ClipboardCheck, Archive, LogIn, Wallet, Receipt, LogOut, Send, Layers,
} from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import { safeFetchJson } from '@/lib/safeFetch';
import { BULK_FIELDS } from '@/lib/imports/bulkFields';
import type { ImportListRow } from '@/types';

interface DashboardCard {
  id: number;
  card_content_id: string;
  card_title: string;
  card_icon: string | null;
  card_color: string | null;
  card_category: string | null;
}

const COLOR_GRADIENTS: Record<string, string> = {
  primary: 'from-indigo-500 to-purple-600',
  emerald: 'from-emerald-500 to-teal-500',
  sky: 'from-sky-500 to-blue-600',
  slate: 'from-slate-500 to-slate-700',
  fuchsia: 'from-fuchsia-500 to-pink-600',
  cyan: 'from-cyan-500 to-blue-500',
  rose: 'from-rose-500 to-red-500',
  teal: 'from-teal-500 to-emerald-600',
  violet: 'from-violet-500 to-indigo-600',
  amber: 'from-amber-500 to-orange-500',
  yellow: 'from-yellow-500 to-amber-600',
  red: 'from-red-500 to-rose-600',
  orange: 'from-orange-500 to-amber-600',
  lime: 'from-lime-500 to-green-600',
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Boxes, CheckCircle2, Activity, Truck, FileX, CalendarX, ShieldAlert,
  ClipboardCheck, Archive, LogIn, Wallet, Receipt, LogOut, Send,
};

interface FilterState {
  client_id: string; type_of_goods: string; entry_point_id: string;
  transport_mode: string; start_date: string; end_date: string;
}
const EMPTY_FILTERS: FilterState = {
  client_id: '', type_of_goods: '', entry_point_id: '', transport_mode: '', start_date: '', end_date: '',
};

interface Option { id: number; label: string }

function fmtDate(d: string | null): string {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
}
function fmtNum(n: string | null): string {
  if (n === null || n === '') return '';
  const v = Number(n);
  return Number.isNaN(v) ? n : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function initialCard(): string {
  if (typeof window === 'undefined') return 'all';
  return new URLSearchParams(window.location.search).get('card') || 'all';
}
// Fetch a master endpoint as {id,label} options (handles flat + paginated shapes).
async function fetchOptions(source: string, labelKey: string): Promise<Option[]> {
  try {
    const r = await fetch(`/api/${source}?pageSize=1000`);
    const j = await r.json();
    const list = Array.isArray(j?.data) ? j.data : Array.isArray(j?.data?.items) ? j.data.items : [];
    return list.map((row: Record<string, unknown>) => ({ id: row.id as number, label: String(row[labelKey] ?? row.id) }));
  } catch {
    return [];
  }
}

export default function ImportsListPage() {
  const [items, setItems] = useState<ImportListRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [clientOpts, setClientOpts] = useState<Option[]>([]);
  const [goodsOpts, setGoodsOpts] = useState<Option[]>([]);
  const [entryOpts, setEntryOpts] = useState<Option[]>([]);
  const [transportOpts, setTransportOpts] = useState<Option[]>([]);

  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);
  const [activeCard, setActiveCard] = useState<string>(initialCard);

  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkField, setBulkField] = useState<string>(BULK_FIELDS[0].name);
  const [bulkValue, setBulkValue] = useState<string>('');
  const [bulkOpts, setBulkOpts] = useState<Option[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const params = new URLSearchParams();
      Object.entries(applied).forEach(([k, v]) => { if (v) params.set(k, v); });
      if (activeCard && activeCard !== 'all') params.set('card', activeCard);
      const res = await fetch(`/api/imports?${params.toString()}`);
      const json = await res.json();
      if (json.success) setItems(json.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [applied, activeCard]);

  useEffect(() => { load(); }, [load]);

  const loadCardsAndStats = useCallback(async () => {
    const [cardsRes, statsRes] = await Promise.all([
      safeFetchJson<DashboardCard[]>('/api/dashboard-cards/me'),
      safeFetchJson<Record<string, number>>('/api/imports/stats'),
    ]);
    if (cardsRes.ok) setCards(cardsRes.data.filter((c) => c.card_category === 'import_dashboard'));
    if (statsRes.ok) setStats(statsRes.data);
  }, []);

  useEffect(() => { loadCardsAndStats(); }, [loadCardsAndStats]);

  // Filter dropdown options — fetched once.
  useEffect(() => {
    (async () => {
      const [c, g, e, t] = await Promise.all([
        fetchOptions('clients', 'short_name'),
        fetchOptions('type-of-goods', 'goods_type'),
        fetchOptions('transit-points', 'transit_point_name'),
        fetchOptions('transport-modes', 'transport_mode_name'),
      ]);
      setClientOpts(c); setGoodsOpts(g); setEntryOpts(e); setTransportOpts(t);
    })();
  }, []);

  // Load options for the chosen bulk field when it's a select.
  useEffect(() => {
    const field = BULK_FIELDS.find((f) => f.name === bulkField);
    setBulkValue('');
    if (field?.type === 'select' && field.optionsSource && field.optionsLabel) {
      fetchOptions(field.optionsSource, field.optionsLabel).then(setBulkOpts);
    } else {
      setBulkOpts([]);
    }
  }, [bulkField]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      (i.mca_ref ?? '').toLowerCase().includes(q) ||
      (i.client_name ?? '').toLowerCase().includes(q) ||
      (i.license_number ?? '').toLowerCase().includes(q) ||
      (i.invoice ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } =
    usePagedList(filtered, { initialPageSize: 25 });

  const hasActiveFilters = Object.values(applied).some(Boolean);

  function applyFilters() {
    if (draft.start_date && draft.end_date && draft.start_date > draft.end_date) return;
    setApplied(draft);
    resetPage();
  }
  function clearFilters() {
    setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); setActiveCard('all'); resetPage();
  }

  // ----- selection (scoped to the filtered set, per §4.9) -----
  const allFilteredSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  function toggleRow(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((i) => i.id)));
  }

  async function applyBulk() {
    const field = BULK_FIELDS.find((f) => f.name === bulkField);
    if (!field || selected.size === 0) return;
    setBulkSaving(true);
    setBulkMsg(null);
    try {
      const res = await fetch('/api/imports/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), values: { [bulkField]: bulkValue || null } }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setBulkMsg(json.message || 'Bulk update failed');
      } else {
        setBulkMsg(`Updated ${json.data.updated} import(s).`);
        setBulkOpen(false);
        await load();
        await loadCardsAndStats();
      }
    } catch {
      setBulkMsg('Bulk update failed');
    } finally {
      setBulkSaving(false);
    }
  }

  const activeBulkField = BULK_FIELDS.find((f) => f.name === bulkField);

  return (
    <DashboardShell>
      <div className="mb-4"><BackButton /></div>

      <div className="card p-4 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary-600" /> Import Management
        </h1>
      </div>

      {/* ---- Stat cards (dashboard_card_master_t, category import_dashboard) ---- */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
          {cards.map((card) => {
            const key = card.card_content_id;
            const Icon = (card.card_icon && ICONS[card.card_icon]) || Layers;
            const gradient = (card.card_color && COLOR_GRADIENTS[card.card_color]) || COLOR_GRADIENTS.primary;
            const active = activeCard === key;
            const value = stats[key] ?? 0;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => { setActiveCard(key); resetPage(); }}
                className={`text-left rounded-xl bg-gradient-to-br ${gradient} text-white p-3 shadow-sm relative overflow-hidden transition hover:shadow-md ${active ? 'ring-2 ring-offset-2 ring-slate-900/40' : ''}`}
                title={`Filter: ${card.card_title}`}
              >
                <div className="absolute right-2 top-2 opacity-30"><Icon className="h-5 w-5" /></div>
                <div className="text-2xl font-bold leading-none">{value}</div>
                <div className="text-[11px] mt-1 opacity-90 uppercase tracking-wide">{card.card_title}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* ---- Advanced Filters ---- */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
          <Filter className="h-4 w-4 text-primary-600" />
          <span className="font-semibold text-slate-800">Advanced Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="label">Filter by Clients</label>
            <select className="input" value={draft.client_id} onChange={(e) => setDraft((d) => ({ ...d, client_id: e.target.value }))}>
              <option value="">All Clients</option>
              {clientOpts.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Type of Goods</label>
            <select className="input" value={draft.type_of_goods} onChange={(e) => setDraft((d) => ({ ...d, type_of_goods: e.target.value }))}>
              <option value="">All Types of Goods</option>
              {goodsOpts.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Entry Point</label>
            <select className="input" value={draft.entry_point_id} onChange={(e) => setDraft((d) => ({ ...d, entry_point_id: e.target.value }))}>
              <option value="">All Entry Points</option>
              {entryOpts.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Transport Mode</label>
            <select className="input" value={draft.transport_mode} onChange={(e) => setDraft((d) => ({ ...d, transport_mode: e.target.value }))}>
              <option value="">All Transport Modes</option>
              {transportOpts.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Start Date</label>
            <input type="date" className="input" value={draft.start_date} max={draft.end_date || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))} />
          </div>
          <div>
            <label className="label">End Date</label>
            <input type="date" className="input" value={draft.end_date} min={draft.start_date || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))} />
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={applyFilters} className="btn-primary inline-flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Apply Filters
            </button>
            {(hasActiveFilters || activeCard !== 'all') && (
              <button type="button" onClick={clearFilters}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-500 hover:bg-slate-600 text-white px-3 py-1.5 text-sm font-medium transition">
                <X className="h-4 w-4" /> Reset All Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- Create + bulk ---- */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Link href="/import/new" className="card p-4 flex-1 min-w-[220px] flex items-center justify-between hover:border-primary-300 hover:shadow-sm transition group">
          <span className="flex items-center gap-2 text-slate-800 font-medium">
            <Truck className="h-4 w-4 text-primary-600" /> Import Tracking
          </span>
          <span className="flex items-center gap-1 text-xs text-primary-600 group-hover:text-primary-700">
            <Plus className="h-3.5 w-3.5" /> New Import
          </span>
        </Link>
        {/* §4.9 — filter-driven bulk editor (pending/missing fields). */}
        <Link href="/import/bulk" className="card p-4 flex-1 min-w-[220px] flex items-center justify-between hover:border-amber-300 hover:shadow-sm transition group">
          <span className="flex items-center gap-2 text-slate-800 font-medium">
            <Layers className="h-4 w-4 text-amber-600" /> Bulk Update
          </span>
          <span className="flex items-center gap-1 text-xs text-amber-600 group-hover:text-amber-700">
            <Edit2 className="h-3.5 w-3.5" /> Fill pending fields
          </span>
        </Link>
      </div>

      {/* ---- List card ---- */}
      <div className="card">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <Truck className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-800">Imports List</span>
          {activeCard !== 'all' && (
            <span className="text-[11px] rounded-full bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5">
              {cards.find((c) => c.card_content_id === activeCard)?.card_title ?? activeCard}
            </span>
          )}
        </div>

        {/* Bulk-update bar (shown when rows are selected). Authorized server-side
            by the import-page edit grant — non-editors get a 403 on apply. */}
        {selected.size > 0 && (
          <div className="px-4 py-3 border-b border-amber-200 bg-amber-50 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-amber-900 inline-flex items-center gap-1.5">
              <Layers className="h-4 w-4" /> {selected.size} selected
            </span>
            {!bulkOpen ? (
              <>
                <button type="button" onClick={() => setBulkOpen(true)} className="btn-primary text-sm">Bulk Update</button>
                <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-slate-600 hover:text-slate-800">Clear selection</button>
              </>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="label text-xs">Field</label>
                  <select className="input py-1 text-sm w-52" value={bulkField} onChange={(e) => setBulkField(e.target.value)}>
                    {BULK_FIELDS.map((f) => (<option key={f.name} value={f.name}>{f.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Value</label>
                  {activeBulkField?.type === 'select' ? (
                    <select className="input py-1 text-sm w-52" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
                      <option value="">— Clear / Select —</option>
                      {bulkOpts.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                    </select>
                  ) : activeBulkField?.type === 'date' ? (
                    <input type="date" className="input py-1 text-sm" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
                  ) : (
                    <input type="text" className="input py-1 text-sm w-52" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
                  )}
                </div>
                <button type="button" onClick={applyBulk} disabled={bulkSaving} className="btn-primary text-sm">
                  {bulkSaving ? 'Applying...' : `Apply to ${selected.size}`}
                </button>
                <button type="button" onClick={() => setBulkOpen(false)} className="text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              </div>
            )}
            {bulkMsg && <span className="text-xs text-emerald-700">{bulkMsg}</span>}
          </div>
        )}

        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 text-sm">
            <select className="input py-1 px-2 text-sm w-auto" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[10, 25, 50, 100].map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
            <span className="text-slate-500">imports per page</span>
          </div>
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-9 text-sm w-64" placeholder="Search MCA ref, client, license, invoice..."
              value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-10 text-center">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll}
                    title="Select all (filtered)" aria-label="Select all" />
                </th>
                <th className="w-12">#</th>
                <th>MCA Ref</th>
                <th>Client</th>
                <th>License</th>
                <th>Invoice</th>
                <th>Pre-Alert Date</th>
                <th className="text-right">Weight</th>
                <th className="text-right">FOB</th>
                <th>Clearing Status</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={11} className="text-center text-slate-500 py-8">Loading...</td></tr>)}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={11} className="text-center text-slate-500 py-8">
                  No imports found — click <strong>New Import</strong> to create one.
                </td></tr>
              )}
              {!loading && paged.map((r, idx) => (
                <tr key={r.id} className={`hover:bg-slate-50 ${selected.has(r.id) ? 'bg-primary-50/40' : ''}`}>
                  <td className="text-center">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} aria-label={`Select ${r.mca_ref ?? r.id}`} />
                  </td>
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td>{r.mca_ref
                    ? <span className="inline-block rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[11px] font-mono font-medium">{r.mca_ref}</span>
                    : <span className="text-slate-300">—</span>}</td>
                  <td className="font-medium">{r.client_name || <span className="text-slate-300">—</span>}</td>
                  <td className="font-mono text-xs">{r.license_number || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{r.invoice || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{fmtDate(r.pre_alert_date) || <span className="text-slate-300">—</span>}</td>
                  <td className="text-right text-slate-700 text-xs">{r.weight ? `${fmtNum(r.weight)} KG` : <span className="text-slate-300">—</span>}</td>
                  <td className="text-right text-slate-700 text-xs">{fmtNum(r.fob) || <span className="text-slate-300">—</span>}</td>
                  <td>{r.clearing_status_name
                    ? <span className="inline-block rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200 px-2.5 py-0.5 text-[11px] font-medium uppercase">{r.clearing_status_name}</span>
                    : <span className="text-slate-300">—</span>}</td>
                  <td>
                    <div className="inline-flex justify-center w-full">
                      <Link href={`/import/${r.id}`} title="Edit"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary-600 hover:bg-primary-700 text-white transition">
                        <Edit2 className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize}
          totalRows={totalRows} totalPages={totalPages} startIndex={startIndex} mounted={mounted}
        />
      </div>
    </DashboardShell>
  );
}
