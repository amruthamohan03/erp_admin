'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Boxes, CalendarClock, Copy, FileSpreadsheet, FileText, Layers, Plus, Send } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import RecordViewModal from '@/components/transactional/RecordViewModal';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/lib/formatDate';
import { safeFetchJson } from '@/lib/safeFetch';

// §2 step 2 — the Quotations list.
//
// This screen used to be the whole module: a 588-line page carrying its own
// create/edit form above its own table, which is exactly the shape §4.3 says a
// case type must NOT take. The form is now a transaction page
// (/quotations/new, /quotations/{id}) driven by the `quotation` master_page
// config, so this file is a list and nothing else — and the form gained
// field-level role grants, the conditions runtime, per-accordion audit and a
// layout an administrator can change without a deploy.

interface DashboardCard {
  id: number;
  card_content_id: string;
  card_title: string;
  card_icon: string | null;
  card_color: string | null;
  card_category: string | null;
}

interface Row {
  id: number;
  quotation_ref: string;
  quotation_date: string | null;
  client_name: string | null;
  kind_name: string | null;
  total_amount: string | null;
  total_amount_cdf: string | null;
}

const COLOR_GRADIENTS: Record<string, string> = {
  primary: 'from-indigo-500 to-purple-600',
  emerald: 'from-emerald-500 to-teal-500',
  sky: 'from-sky-500 to-blue-600',
  violet: 'from-violet-500 to-indigo-600',
  amber: 'from-amber-500 to-orange-500',
  slate: 'from-slate-500 to-slate-700',
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  Boxes,
  Send,
  Layers,
  CalendarClock,
};

const money = (v: string | null): string =>
  (Number.isFinite(Number(v)) ? Number(v) : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function QuotationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [activeCard, setActiveCard] = useState('all');

  const [viewId, setViewId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCard !== 'all') params.set('card', activeCard);
      const res = await safeFetchJson<Row[]>(`/api/v1/quotations?${params}`);
      if (!res.ok) {
        setResult({ status: 'error', title: 'Not loaded', message: res.message });
        return;
      }
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, [activeCard]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const loadStats = useCallback(async () => {
    const res = await safeFetchJson<Record<string, number>>('/api/v1/quotations/stats');
    if (res.ok) setStats(res.data);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadStats(); }, [loadStats]);

  // §4.29 — the cards themselves are configuration, filtered to this module.
  useEffect(() => {
    void (async () => {
      const res = await safeFetchJson<DashboardCard[]>('/api/v1/dashboard-cards/me');
      if (res.ok) {
        setCards(res.data.filter((c) => (c.card_category ?? '').toLowerCase() === 'quotation'));
      }
    })();
  }, []);

  async function remove(row: Row): Promise<void> {
    const res = await safeFetchJson<unknown>(`/api/v1/quotations/${row.id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: res.message });
      return;
    }
    setResult({
      status: 'success',
      title: 'Deleted',
      message: `Quotation ${row.quotation_ref} has been removed from the list.`,
    });
    void load();
    void loadStats();
  }

  const cardKeys = useMemo(() => cards.map((c) => c.card_content_id), [cards]);

  return (
    <>
      <div className="card overflow-hidden mb-4">
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600" />
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <FileText className="h-5 w-5 text-primary-600" /> Quotations
          </h1>
        </div>
      </div>

      {cardKeys.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {cards.map((card) => {
            const key = card.card_content_id;
            const Icon = (card.card_icon && ICONS[card.card_icon]) || FileText;
            const gradient =
              (card.card_color && COLOR_GRADIENTS[card.card_color]) || COLOR_GRADIENTS.primary;
            const active = activeCard === key;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setActiveCard(active ? 'all' : key)}
                className={`rounded-xl bg-gradient-to-br p-3 text-left text-white shadow-sm transition hover:shadow-md ${gradient} ${active ? 'ring-2 ring-foreground/40 ring-offset-2' : ''}`}
              >
                <Icon className="mb-1 h-4 w-4 opacity-90" />
                <div className="text-2xl font-bold leading-none">{stats[key] ?? 0}</div>
                <div className="mt-1 text-[11px] uppercase tracking-wide opacity-90">
                  {card.card_title}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <DataTable<Row>
        rows={rows}
        loading={loading}
        rowKey={(r) => r.id}
        title="Quotations List"
        searchPlaceholder="Search reference, client, kind…"
        emptyMessage="No quotations yet — create the first one."
        // main's "Export Excel (Client-wise)": one SUMMARY sheet of every live
        // quotation, sorted by client code, a column per category with customs
        // excluded. It never took a filter, so no card is passed — sending one
        // the route ignores would promise a narrower sheet than it delivers.
        exportHref="/api/v1/quotations/export"
        toolbar={
          // §4.35 — one create action, in the table's toolbar, last in the row.
          <Link href="/quotations/new" className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Quotation
          </Link>
        }
        columns={[
          {
            key: 'quotation_ref',
            header: 'Ref',
            sortable: true,
            className: 'font-mono font-semibold',
          },
          // §4.15 — the Client column is the short code, not the legal name.
          { key: 'client_name', header: 'Client', sortable: true },
          {
            key: 'quotation_date',
            header: 'Date',
            sortable: true,
            // §4.19 — a date column without a `render` prints the stored ISO.
            render: (r) => formatDate(r.quotation_date),
          },
          {
            key: 'kind_name',
            header: 'Kind',
            render: (r) => (
              <span className="inline-block rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                {r.kind_name ?? '—'}
              </span>
            ),
          },
          {
            key: 'total_amount',
            header: 'Total USD',
            align: 'right',
            sortable: true,
            className: 'tabular-nums font-semibold',
            // main prints the currency after the figure: "1,250.00 USD".
            render: (r) => `${money(r.total_amount)} USD`,
          },
          {
            key: 'total_amount_cdf',
            header: 'Total CDF',
            align: 'right',
            sortable: true,
            className: 'tabular-nums',
            // A dash rather than 0.00: only an Import-Definitive quotation has
            // a CDF side, and a zero would read as one that came to nothing.
            render: (r) =>
              Number(r.total_amount_cdf) > 0 ? (
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {money(r.total_amount_cdf)} CDF
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
        ]}
        actions={(r) => ({
          view: () => setViewId(r.id),
          edit: `/quotations/${r.id}`,
          remove: () => setConfirmDelete(r),
          // main's Copy: a new quotation pre-filled from this one — pickers,
          // lines and ARSP — dated today, with its reference rebuilt. Sky, as
          // main's btn-info, and outside the reserved view/edit/delete hues
          // (§4.20).
          extra: (
            <Link
              href={`/quotations/new?copy=${r.id}`}
              title="Copy"
              aria-label={`Copy quotation ${r.quotation_ref}`}
              className="ico ms-1 text-sky-600 hover:bg-accent dark:text-sky-400"
            >
              <Copy className="h-4 w-4" />
            </Link>
          ),
        })}
      />

      {viewId !== null && (
        <RecordViewModal
          slug="quotation"
          entityId={viewId}
          editHref={`/quotations/${viewId}`}
          onClose={() => setViewId(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this quotation?"
        confirmLabel="Delete"
        tone="danger"
        icon={<FileSpreadsheet className="h-5 w-5" />}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
      >
        {confirmDelete && (
          <>
            Quotation{' '}
            <strong className="text-foreground">{confirmDelete.quotation_ref}</strong> and its priced
            lines will be hidden from the list. It stays on file for anything already invoiced
            against it, and the reference becomes free to use again.
          </>
        )}
      </ConfirmDialog>

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
