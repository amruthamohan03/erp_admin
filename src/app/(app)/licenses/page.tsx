'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Edit2,
  Filter,
  Check,
  X,
  FileText,
  FileCheck,
  CheckCircle2,
  ShieldCheck,
  Clock,
  XCircle,
  CalendarClock,
  Layers,
  Eye,
  FileSpreadsheet,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import RecordViewModal from '@/components/transactional/RecordViewModal';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { CLIENT_OPTION_LABEL_FIELD } from '@/lib/clientOptions';
import { fetchMasterOptions as fetchOptions, type MasterOption } from '@/lib/selectOptions';
import { formatDate } from '@/lib/formatDate';

const fmtDate = (v: unknown): string => formatDate(v, '');

// A row of the licenses list — mirrors the /api/v1/licenses GET select.
interface LicenseRow {
  id: number;
  license_number: string | null;
  client_name: string | null;
  kind_name: string | null;
  bank_name: string | null;
  transport_mode_name: string | null;
  invoice_number: string | null;
  license_applied_date: string | null;
  license_expiry_date: string | null;
  status: string;
}

// Cards live in dashboard_card_master_t (category 'license_dashboard') and are
// mapped to roles via role_dashboard_card_mapping_t. The page only renders the
// cards the user's role can see — nothing is hardcoded here. The count for each
// card is read from /api/v1/licenses/stats via the `#fragment` on data_source.
interface DashboardCard {
  id: number;
  card_content_id: string;
  card_title: string;
  card_icon: string | null;
  card_color: string | null;
  card_category: string | null;
  data_source: string | null;
}

// Status → badge colour. Mirrors main's license statuses.
const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  INACTIVE: 'bg-muted text-muted-foreground border-border',
  ANNULATED: 'bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-300 border-red-200 dark:border-red-500/30',
  MODIFIED: 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  PROROGATED: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
};

// card_color (short semantic name) → Tailwind gradient. Mirrors the /imports page.
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
  FileCheck,
  CheckCircle2,
  ShieldCheck,
  Clock,
  XCircle,
  CalendarClock,
  FileText,
};

interface FilterState {
  client_id: string;
  transport_mode_id: string;
  start_date: string;
  end_date: string;
}
const EMPTY_FILTERS: FilterState = {
  client_id: '',
  transport_mode_id: '',
  start_date: '',
  end_date: '',
};

type Option = MasterOption;


// Stat value backing a card. The seed stores the exact stats key in the
// data_source fragment (e.g. '/api/v1/licenses/stats#total_count').
function statKeyFor(card: DashboardCard): string {
  return card.data_source?.split('#')[1] ?? `${card.card_content_id}_count`;
}



function buildParams(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.client_id) p.set('client_id', f.client_id);
  if (f.transport_mode_id) p.set('transport_mode_id', f.transport_mode_id);
  if (f.start_date) p.set('start_date', f.start_date);
  if (f.end_date) p.set('end_date', f.end_date);
  return p;
}

export default function LicensesListPage() {
  const [items, setItems] = useState<LicenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [clientOpts, setClientOpts] = useState<Option[]>([]);
  const [transportOpts, setTransportOpts] = useState<Option[]>([]);

  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);
  const [activeCard, setActiveCard] = useState<string>('all');

  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});

  // Read-only details modal — null when closed, else the row id to view.
  const [viewId, setViewId] = useState<number | null>(null);

  // CSV/XLSX exports: a plain navigation the server answers with an attachment.
  function exportOne(id: number): void {
    window.location.assign(`/api/v1/licenses/${id}/export`);
  }
  function exportAll(): void {
    const params = buildParams(applied);
    if (activeCard !== 'all') params.set('card', activeCard);
    if (search.trim()) params.set('q', search.trim());
    const qs = params.toString();
    window.location.assign(`/api/v1/licenses/export${qs ? `?${qs}` : ''}`);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams(applied);
      if (activeCard !== 'all') params.set('card', activeCard);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`/api/v1/licenses?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } catch {
      // ignore — list stays empty
    } finally {
      setLoading(false);
    }
  }, [applied, activeCard, page, pageSize, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Dashboard cards (role-scoped) + stat totals — fetched once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cardsRes, statsRes] = await Promise.all([
          fetch('/api/v1/dashboard-cards/me').then((r) => r.json()),
          fetch('/api/v1/licenses/stats').then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (cardsRes.ok) {
          setCards(
            (cardsRes.data as DashboardCard[]).filter(
              (c) => c.card_category === 'license_dashboard',
            ),
          );
        }
        if (statsRes.ok) setStats(statsRes.data as Record<string, number>);
      } catch {
        // ignore — cards simply won't render
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter dropdown options — fetched once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, t] = await Promise.all([
        // Clients are labelled by short code app-wide (§4.15).
        fetchOptions('clients', CLIENT_OPTION_LABEL_FIELD),
        fetchOptions('transport-modes', 'transport_mode_name'),
      ]);
      if (cancelled) return;
      setClientOpts(c);
      setTransportOpts(t);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasActiveFilters = Object.values(applied).some(Boolean);

  function applyFilters() {
    if (draft.start_date && draft.end_date && draft.start_date > draft.end_date)
      return;
    setApplied(draft);
    setPage(1);
  }
  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setActiveCard('all');
    setPage(1);
  }

  return (
    <>
      <div className="card p-4 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary-600" /> Licenses Management
        </h1>
        <button
          type="button"
          onClick={exportAll}
          title="Export all licenses (respects active filters) to Excel/CSV"
          className="btn-excel btn-sm"
        >
          <FileSpreadsheet className="h-4 w-4" /> Export All to Excel
        </button>
      </div>

      {/* ---- Stat cards (dashboard_card_master_t, category license_dashboard).
              Click filters the list to the matching status bucket. ---- */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
          {cards.map((card) => {
            const key = card.card_content_id;
            const Icon = (card.card_icon && ICONS[card.card_icon]) || Layers;
            const gradient =
              (card.card_color && COLOR_GRADIENTS[card.card_color]) ||
              COLOR_GRADIENTS.primary;
            const active = activeCard === key;
            const value = stats[statKeyFor(card)] ?? 0;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  setActiveCard(active ? 'all' : key);
                  setPage(1);
                }}
                className={`text-left rounded-xl bg-gradient-to-br ${gradient} text-white p-3 shadow-sm relative overflow-hidden transition hover:shadow-md ${active ? 'ring-2 ring-offset-2 ring-foreground/40' : ''}`}
                title={`Filter: ${card.card_title}`}
              >
                <div className="absolute right-2 top-2 opacity-30">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-2xl font-bold leading-none">{value}</div>
                <div className="text-[11px] mt-1 opacity-90 uppercase tracking-wide">
                  {card.card_title}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ---- Advanced Filters ---- */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
          <Filter className="h-4 w-4 text-primary-600" />
          <span className="font-semibold text-foreground">Advanced Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-end">
          <div>
            <label className="label">Client</label>
            <SearchableSelect
              aria-label="Client"
              value={draft.client_id}
              emptyLabel="All Clients"
              placeholder="All Clients"
              options={clientOpts.map((o) => ({ value: String(o.id), label: o.label }))}
              onChange={(v) => setDraft((d) => ({ ...d, client_id: v }))}
            />
          </div>
          <div>
            <label className="label">Transport Mode</label>
            <SearchableSelect
              aria-label="Transport mode"
              value={draft.transport_mode_id}
              emptyLabel="All Transport Modes"
              placeholder="All Transport Modes"
              options={transportOpts.map((o) => ({ value: String(o.id), label: o.label }))}
              onChange={(v) => setDraft((d) => ({ ...d, transport_mode_id: v }))}
            />
          </div>
          <div>
            <label className="label">Start Date</label>
            <input
              type="date"
              className="input"
              value={draft.start_date}
              max={draft.end_date || undefined}
              onChange={(e) =>
                setDraft((d) => ({ ...d, start_date: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="label">End Date</label>
            <input
              type="date"
              className="input"
              value={draft.end_date}
              min={draft.start_date || undefined}
              onChange={(e) =>
                setDraft((d) => ({ ...d, end_date: e.target.value }))
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={applyFilters}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Check className="h-4 w-4" /> Apply Filters
            </button>
            {(hasActiveFilters || activeCard !== 'all') && (
              <button
                type="button"
                onClick={clearFilters}
                className="btn-neutral btn-sm"
              >
                <X className="h-4 w-4" /> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- Create card — links to /licenses/new ---- */}
      <Link
        href="/licenses/new"
        className="card p-4 mb-4 flex items-center justify-between hover:border-primary-300 hover:shadow-sm transition group"
      >
        <span className="flex items-center gap-2 text-foreground font-medium">
          <FileText className="h-4 w-4 text-primary-600" />
          Create License
        </span>
        <span className="flex items-center gap-1 text-xs text-primary-600 group-hover:text-primary-700">
          <Plus className="h-3.5 w-3.5" />
          New License
        </span>
      </Link>

      {/* ---- List card ---- */}
      <DataTable<LicenseRow>
        rows={items}
        loading={loading}
        rowKey={(l) => l.id}
        title={
          <span className="inline-flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            License List
            {activeCard !== 'all' && (
              <span className="text-[11px] rounded-full bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5">
                {cards.find((c) => c.card_content_id === activeCard)?.card_title ?? activeCard}
              </span>
            )}
          </span>
        }
        searchPlaceholder="Search license, client, bank, invoice..."
        emptyMessage="No licences match these filters — clear them, or create one."
        columns={[
          { key: 'license_number', header: 'License Number', className: 'font-mono text-xs font-medium' },
          { key: 'client_name', header: 'Client', className: 'font-medium' },
          { key: 'kind_name', header: 'Kind', className: 'text-xs' },
          { key: 'bank_name', header: 'Bank', className: 'text-xs' },
          { key: 'transport_mode_name', header: 'Transport', className: 'text-xs' },
          { key: 'invoice_number', header: 'Invoice #', className: 'text-xs' },
          {
            key: 'license_applied_date',
            header: 'Applied',
            className: 'text-xs',
            render: (l: LicenseRow) => fmtDate(l.license_applied_date) || <span className="text-muted-foreground">—</span>,
          },
          {
            key: 'license_expiry_date',
            header: 'Expiry',
            className: 'text-xs',
            render: (l: LicenseRow) => fmtDate(l.license_expiry_date) || <span className="text-muted-foreground">—</span>,
          },
          {
            key: 'status',
            header: 'Status',
            render: (l: LicenseRow) => (
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${STATUS_BADGE[l.status] ?? STATUS_BADGE.INACTIVE}`}
              >
                {l.status}
              </span>
            ),
          },
        ]}
        actions={(l) => ({
          view: () => setViewId(l.id),
          edit: `/licenses/${l.id}`,
          extra: (
            <button
              type="button"
              onClick={() => exportOne(l.id)}
              title="Export to Excel"
              className="btn-excel btn-icon ms-1"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </button>
          ),
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

      {viewId !== null && (
        <RecordViewModal
          slug="license"
          entityId={viewId}
          editHref={`/licenses/${viewId}`}
          onExport={() => exportOne(viewId)}
          onClose={() => setViewId(null)}
        />
      )}
    </>
  );
}
