'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Plus, Search, Edit2, Filter, Check, X, FileText,
  CalendarX, Clock, AlertTriangle, Ban, Pencil, History, Layers,
  Eye, FileSpreadsheet,
} from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { LicenseListRow } from '@/types';

// Status → badge colour. Mirrors the source license statuses.
const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  INACTIVE: 'bg-slate-100 text-slate-600 border-slate-200',
  ANNULATED: 'bg-red-100 text-red-800 border-red-200',
  MODIFIED: 'bg-amber-100 text-amber-800 border-amber-200',
  PROROGATED: 'bg-cyan-100 text-cyan-800 border-cyan-200',
};

// License stat cards live in dashboard_card_master_t (category 'license_dashboard')
// and are mapped to roles via role_dashboard_card_mapping_t (see migration 0063).
// The page only renders cards the user's role can see — nothing is hardcoded here.
interface DashboardCard {
  id: number;
  card_content_id: string;
  card_title: string;
  card_icon: string | null;
  card_color: string | null;
  card_category: string | null;
}

// Joined license detail rendered read-only in the View popup (from /api/licenses/[id]).
interface ViewLicense {
  id: number;
  license_number: string | null;
  client_name: string | null;
  bank_name: string | null;
  kind_name: string | null;
  license_cleared_by_name: string | null;
  type_of_goods: string | null;
  weight: string | null;
  m3: string | null;
  unit_name: string | null;
  currency_short_name: string | null;
  fob_declared: string | null;
  insurance: string | null;
  freight: string | null;
  other_costs: string | null;
  transport_mode_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  supplier: string | null;
  license_applied_date: string | null;
  license_validation_date: string | null;
  license_expiry_date: string | null;
  fsi: string | null;
  aur: string | null;
  entry_post_name: string | null;
  ref_cod: string | null;
  payment_method_name: string | null;
  payment_subtype: string | null;
  destination_name: string | null;
  status: string;
}

// card_color (short semantic name) → Tailwind gradient. Mirrors the /import page.
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

// card_icon (lucide name from the seed) → component.
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, CalendarX, Clock, AlertTriangle, Ban, Pencil, History,
};

interface FilterState {
  client_id: string;
  transport_mode_id: string;
  start_date: string;
  end_date: string;
}

const EMPTY_FILTERS: FilterState = {
  client_id: '', transport_mode_id: '', start_date: '', end_date: '',
};

interface ClientOption { id: number; short_name: string }
interface TransportOption { id: number; transport_mode_name: string }

function fmtDate(d: string | null): string {
  if (!d) return '';
  // Date columns arrive as 'YYYY-MM-DD'; render dd/mm/yyyy without timezone shifts.
  const [y, m, day] = d.slice(0, 10).split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
}

// Whole days between today (local midnight) and a 'YYYY-MM-DD' date.
// Positive = in the future, negative = in the past. null when no date.
function daysFromToday(d: string | null): number | null {
  if (!d) return null;
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  if (!y || !m || !day) return null;
  const today = new Date();
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(y, m - 1, day);
  return Math.round((b - a) / 86_400_000);
}

// First ?card= value on initial render — lets the seeded card_url deep-links
// (/license?card=expired) open straight into the matching popup.
function initialCard(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('card');
}

export default function LicensesListPage() {
  const [items, setItems] = useState<LicenseListRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Advanced filter dropdown data.
  const [clientOpts, setClientOpts] = useState<ClientOption[]>([]);
  const [transportOpts, setTransportOpts] = useState<TransportOption[]>([]);

  // `draft` = what's in the filter inputs; `applied` = what's been submitted.
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);

  // Stat cards (config-driven) + their counts.
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});

  // Click-through popup: which card is open, and the licenses behind it.
  const [openCard, setOpenCard] = useState<DashboardCard | null>(null);
  const [modalRows, setModalRows] = useState<LicenseListRow[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // View-details popup (per-row eye action).
  const [viewOpen, setViewOpen] = useState(false);
  const [viewData, setViewData] = useState<ViewLicense | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  // CSV exports reuse the established clients pattern: a plain navigation that
  // the server answers with a Content-Disposition: attachment response.
  function exportOne(id: number): void {
    window.location.href = `/api/licenses/${id}/export`;
  }
  function exportAll(): void {
    const params = new URLSearchParams();
    if (applied.client_id) params.set('client_id', applied.client_id);
    if (applied.transport_mode_id) params.set('transport_mode_id', applied.transport_mode_id);
    if (applied.start_date) params.set('start_date', applied.start_date);
    if (applied.end_date) params.set('end_date', applied.end_date);
    const qs = params.toString();
    window.location.href = `/api/licenses/export-all${qs ? `?${qs}` : ''}`;
  }

  async function openView(id: number): Promise<void> {
    setViewOpen(true);
    setViewLoading(true);
    setViewData(null);
    try {
      const res = await fetch(`/api/licenses/${id}`);
      const json = await res.json();
      if (json.success) setViewData(json.data);
    } catch {
      // ignore — modal shows nothing and can be closed
    } finally {
      setViewLoading(false);
    }
  }

  // Load the role's license cards + the per-card counts once.
  useEffect(() => {
    (async () => {
      try {
        const [cardsRes, statsRes] = await Promise.all([
          fetch('/api/dashboard-cards/me'),
          fetch('/api/licenses/stats'),
        ]);
        const [cardsJson, statsJson] = await Promise.all([cardsRes.json(), statsRes.json()]);
        if (cardsJson.success) {
          setCards(
            (cardsJson.data as DashboardCard[]).filter(
              (c) => c.card_category === 'license_dashboard',
            ),
          );
        }
        if (statsJson.success) setStats(statsJson.data);
      } catch {
        // ignore — page still works without the cards strip
      }
    })();
  }, []);

  // Open a card's popup and load the matching licenses (same ?card= filter that
  // backs the count, so the list and the number always agree).
  const openCardPopup = useCallback(async (card: DashboardCard) => {
    setOpenCard(card);
    setModalLoading(true);
    setModalRows([]);
    try {
      const key = card.card_content_id;
      const qs = key && key !== 'all' ? `?card=${encodeURIComponent(key)}` : '';
      const res = await fetch(`/api/licenses${qs}`);
      const json = await res.json();
      if (json.success) setModalRows(json.data);
    } catch {
      // ignore — modal shows the empty state
    } finally {
      setModalLoading(false);
    }
  }, []);

  // Deep-link: open the matching popup once the cards have loaded, so the seeded
  // card_url links (/license?card=expired) land straight on the right list.
  useEffect(() => {
    const key = initialCard();
    if (!key || cards.length === 0) return;
    const card = cards.find((c) => c.card_content_id === key);
    if (card) openCardPopup(card);
  }, [cards, openCardPopup]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (applied.client_id) params.set('client_id', applied.client_id);
      if (applied.transport_mode_id) params.set('transport_mode_id', applied.transport_mode_id);
      if (applied.start_date) params.set('start_date', applied.start_date);
      if (applied.end_date) params.set('end_date', applied.end_date);
      const res = await fetch(`/api/licenses?${params.toString()}`);
      const json = await res.json();
      if (json.success) setItems(json.data);
    } catch {
      // ignore — list will be empty
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => { load(); }, [load]);

  // Filter dropdown options — fetched once.
  useEffect(() => {
    (async () => {
      try {
        const [cRes, tRes] = await Promise.all([
          fetch('/api/clients'),
          fetch('/api/transport-modes'),
        ]);
        const [cJson, tJson] = await Promise.all([cRes.json(), tRes.json()]);
        if (cJson.success) setClientOpts(cJson.data);
        if (tJson.success) setTransportOpts(tJson.data);
      } catch {
        // ignore — filters just stay empty
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      (i.license_number ?? '').toLowerCase().includes(q) ||
      (i.client_name ?? '').toLowerCase().includes(q) ||
      (i.bank_name ?? '').toLowerCase().includes(q) ||
      (i.invoice_number ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } =
    usePagedList(filtered, { initialPageSize: 25 });

  const hasActiveFilters = !!(applied.client_id || applied.transport_mode_id || applied.start_date || applied.end_date);

  function applyFilters() {
    if (draft.start_date && draft.end_date && draft.start_date > draft.end_date) {
      // Guard the obvious inversion; the date inputs already constrain min/max below.
      return;
    }
    setApplied(draft);
    resetPage();
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    resetPage();
  }

  return (
    <DashboardShell>
      <div className="mb-4"><BackButton /></div>

      {/* ---- Page header ---- */}
      <div className="card p-4 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary-600" />
          Licenses Management
        </h1>
        <button
          type="button"
          onClick={exportAll}
          title="Export all licenses (respects active filters) to Excel/CSV"
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm font-medium transition"
        >
          <FileSpreadsheet className="h-4 w-4" /> Export All to Excel
        </button>
      </div>

      {/* ---- Stat cards (dashboard_card_master_t, category license_dashboard).
              Click opens a popup listing the matching licenses. ---- */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
          {cards.map((card) => {
            const key = card.card_content_id;
            const Icon = (card.card_icon && ICONS[card.card_icon]) || Layers;
            const gradient = (card.card_color && COLOR_GRADIENTS[card.card_color]) || COLOR_GRADIENTS.primary;
            const value = stats[key] ?? 0;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => openCardPopup(card)}
                className={`text-left rounded-xl bg-gradient-to-br ${gradient} text-white p-3 shadow-sm relative overflow-hidden transition hover:shadow-md hover:-translate-y-0.5`}
                title={`View ${card.card_title} licenses`}
              >
                <div className="absolute right-2 top-2 opacity-30"><Icon className="h-6 w-6" /></div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-end">
          <div>
            <label className="label">Client</label>
            <select
              className="input"
              value={draft.client_id}
              onChange={(e) => setDraft((d) => ({ ...d, client_id: e.target.value }))}
            >
              <option value="">All Clients</option>
              {clientOpts.map((c) => (<option key={c.id} value={c.id}>{c.short_name}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Transport Mode</label>
            <select
              className="input"
              value={draft.transport_mode_id}
              onChange={(e) => setDraft((d) => ({ ...d, transport_mode_id: e.target.value }))}
            >
              <option value="">All Transport Modes</option>
              {transportOpts.map((t) => (<option key={t.id} value={t.id}>{t.transport_mode_name}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Start Date</label>
            <input
              type="date"
              className="input"
              value={draft.start_date}
              max={draft.end_date || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">End Date</label>
            <input
              type="date"
              className="input"
              value={draft.end_date}
              min={draft.start_date || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={applyFilters} className="btn-primary inline-flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Apply Filters
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-500 hover:bg-slate-600 text-white px-3 py-1.5 text-sm font-medium transition"
              >
                <X className="h-4 w-4" /> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- Create card — links to /license/new ---- */}
      <Link
        href="/license/new"
        className="card p-4 mb-4 flex items-center justify-between hover:border-primary-300 hover:shadow-sm transition group"
      >
        <span className="flex items-center gap-2 text-slate-800 font-medium">
          <FileText className="h-4 w-4 text-primary-600" />
          Create License
        </span>
        <span className="flex items-center gap-1 text-xs text-primary-600 group-hover:text-primary-700">
          <Plus className="h-3.5 w-3.5" />
          New License
        </span>
      </Link>

      {/* ---- List card ---- */}
      <div className="card">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-800">License List</span>
          {hasActiveFilters && (
            <span className="text-[11px] rounded-full bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5">
              filtered
            </span>
          )}
        </div>

        {/* Toolbar: page-size + search */}
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 text-sm">
            <select
              className="input py-1 px-2 text-sm w-auto"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {[10, 25, 50, 100].map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
            <span className="text-slate-500">entries per page</span>
          </div>

          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9 text-sm w-64"
              placeholder="Search license, client, bank, invoice..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>License Number</th>
                <th>Client</th>
                <th>Kind</th>
                <th>Bank</th>
                <th>Transport</th>
                <th>Invoice #</th>
                <th>Applied</th>
                <th>Expiry</th>
                <th>Status</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} className="text-center text-slate-500 py-8">Loading...</td></tr>
              )}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={11} className="text-center text-slate-500 py-8">
                  No licenses found — click <strong>New License</strong> to create one.
                </td></tr>
              )}
              {!loading && paged.map((l, idx) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-mono text-xs font-medium">{l.license_number || <span className="text-slate-300">—</span>}</td>
                  <td className="font-medium">{l.client_name || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{l.kind_name || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{l.bank_name || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{l.transport_mode_name || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{l.invoice_number || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{fmtDate(l.license_applied_date) || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{fmtDate(l.license_expiry_date) || <span className="text-slate-300">—</span>}</td>
                  <td>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${STATUS_BADGE[l.status] ?? STATUS_BADGE.INACTIVE}`}>
                      {l.status}
                    </span>
                  </td>
                  <td>
                    <div className="inline-flex rounded-md shadow-sm overflow-hidden w-full justify-center">
                      <button
                        type="button"
                        onClick={() => openView(l.id)}
                        title="View details"
                        className="inline-flex items-center justify-center w-7 h-7 bg-slate-600 hover:bg-slate-700 text-white transition"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <Link
                        href={`/license/${l.id}`}
                        title="Edit"
                        className="inline-flex items-center justify-center w-7 h-7 bg-primary-600 hover:bg-primary-700 text-white transition"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => exportOne(l.id)}
                        title="Export to Excel"
                        className="inline-flex items-center justify-center w-7 h-7 bg-emerald-600 hover:bg-emerald-700 text-white transition"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          totalRows={totalRows}
          totalPages={totalPages}
          startIndex={startIndex}
          mounted={mounted}
        />
      </div>

      {/* ---- Card click-through popup ---- */}
      {openCard && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 sm:p-8 overflow-y-auto"
          onClick={() => setOpenCard(null)}
        >
          <div
            className="card w-full max-w-3xl my-auto overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Gradient header matching the card colour */}
            <div
              className={`flex items-center justify-between px-5 py-4 text-white bg-gradient-to-br ${
                (openCard.card_color && COLOR_GRADIENTS[openCard.card_color]) || COLOR_GRADIENTS.primary
              }`}
            >
              <h2 className="font-semibold flex items-center gap-2">
                {(() => {
                  const Icon = (openCard.card_icon && ICONS[openCard.card_icon]) || Layers;
                  return <Icon className="h-5 w-5" />;
                })()}
                {openCard.card_title} Licenses
                <span className="ml-1 rounded-full bg-white/25 px-2 py-0.5 text-xs font-medium">
                  {modalRows.length}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setOpenCard(null)}
                className="rounded-md p-1 hover:bg-white/20 transition"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-100">
              {modalLoading && (
                <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
              )}
              {!modalLoading && modalRows.length === 0 && (
                <div className="py-10 text-center text-sm text-slate-500">
                  No {openCard.card_title.toLowerCase()} licenses found.
                </div>
              )}
              {!modalLoading && modalRows.map((l) => {
                const key = openCard.card_content_id;
                const due = daysFromToday(l.license_expiry_date);
                let badge: { text: string; cls: string } | null = null;
                if (key === 'expired' && due !== null) {
                  badge = { text: `${Math.abs(due)} day${Math.abs(due) === 1 ? '' : 's'} ago`, cls: 'bg-red-500 text-white' };
                } else if (key === 'expiring' && due !== null) {
                  const cls = due <= 7 ? 'bg-red-500 text-white' : due <= 15 ? 'bg-amber-400 text-slate-900' : 'bg-cyan-500 text-white';
                  badge = { text: `${due} day${due === 1 ? '' : 's'}`, cls };
                }
                return (
                  <Link
                    key={l.id}
                    href={`/license/${l.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition"
                  >
                    {badge && (
                      <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${badge.cls}`}>
                        {badge.text}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs font-medium text-slate-900">
                        {l.license_number || <span className="text-slate-300">— no number —</span>}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {l.client_name || '—'} · {l.bank_name || '—'}
                        {l.license_applied_date && <> · Applied {fmtDate(l.license_applied_date)}</>}
                      </div>
                    </div>
                    {l.license_expiry_date && (
                      <div className="shrink-0 text-right text-xs text-slate-500">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">Expiry</div>
                        {fmtDate(l.license_expiry_date)}
                      </div>
                    )}
                    <Edit2 className="h-4 w-4 shrink-0 text-primary-600" />
                  </Link>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setOpenCard(null)}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-500 hover:bg-slate-600 text-white px-3 py-1.5 text-sm font-medium transition"
              >
                <X className="h-4 w-4" /> Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ---- View details popup (per-row eye action) ---- */}
      {viewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 sm:p-8 overflow-y-auto"
          onClick={() => setViewOpen(false)}
        >
          <div
            className="card w-full max-w-2xl my-auto overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between px-5 py-4 text-white bg-gradient-to-br ${COLOR_GRADIENTS.primary}`}>
              <h2 className="font-semibold flex items-center gap-2">
                <Eye className="h-5 w-5" />
                License Details
                {viewData?.license_number && (
                  <span className="ml-1 font-mono text-sm opacity-90">{viewData.license_number}</span>
                )}
              </h2>
              <button
                type="button"
                onClick={() => setViewOpen(false)}
                className="rounded-md p-1 hover:bg-white/20 transition"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              {viewLoading && (
                <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
              )}
              {!viewLoading && !viewData && (
                <div className="py-10 text-center text-sm text-slate-500">License not found.</div>
              )}
              {!viewLoading && viewData && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {([
                    ['License Number', viewData.license_number],
                    ['Status', viewData.status],
                    ['Client', viewData.client_name],
                    ['Bank', viewData.bank_name],
                    ['Kind', viewData.kind_name],
                    ['License Cleared By', viewData.license_cleared_by_name],
                    ['Type of Goods', viewData.type_of_goods],
                    ['Weight', viewData.weight ? `${viewData.weight} ${viewData.unit_name ?? ''}`.trim() : null],
                    ['M3', viewData.m3],
                    ['FOB Declared', viewData.fob_declared ? `${viewData.fob_declared} ${viewData.currency_short_name ?? ''}`.trim() : null],
                    ['Insurance', viewData.insurance],
                    ['Freight', viewData.freight],
                    ['Other Costs', viewData.other_costs],
                    ['Transport Mode', viewData.transport_mode_name],
                    ['Supplier/Buyer', viewData.supplier],
                    ['Invoice Number', viewData.invoice_number],
                    ['Invoice Date', fmtDate(viewData.invoice_date)],
                    ['Applied Date', fmtDate(viewData.license_applied_date)],
                    ['Validation Date', fmtDate(viewData.license_validation_date)],
                    ['Expiry Date', fmtDate(viewData.license_expiry_date)],
                    ['FSI/FSO', viewData.fsi],
                    ['AUR', viewData.aur],
                    ['Entry/Exit Post', viewData.entry_post_name],
                    ['REF. COD', viewData.ref_cod],
                    ['Payment Method', viewData.payment_method_name],
                    ['Payment Subtype', viewData.payment_subtype],
                    ['Destination/Origin', viewData.destination_name],
                  ] as Array<[string, string | null | undefined]>).map(([label, value]) => (
                    <div key={label} className="border-b border-slate-100 pb-2">
                      <div className="text-[11px] uppercase tracking-wide text-primary-600 font-semibold">{label}</div>
                      <div className="text-sm text-slate-800">
                        {value !== null && value !== undefined && value !== ''
                          ? value
                          : <span className="text-slate-300">—</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              {viewData && (
                <Link
                  href={`/license/${viewData.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 text-sm font-medium transition"
                >
                  <Edit2 className="h-4 w-4" /> Edit
                </Link>
              )}
              {viewData && (
                <button
                  type="button"
                  onClick={() => exportOne(viewData.id)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm font-medium transition"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Export
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-500 hover:bg-slate-600 text-white px-3 py-1.5 text-sm font-medium transition"
              >
                <X className="h-4 w-4" /> Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
