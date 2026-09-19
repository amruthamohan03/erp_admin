'use client';

// §2 step 5 — what the export and import invoice lists share (§4.10): the stat
// cards (the Pending card opens the pending modal, the rest filter the list), the
// validation badge, the created-date range, and the validate / DGI-verify /
// delete row actions with their confirmation and outcome dialogs.
import { useState, type ComponentType, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  ShieldCheck,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';

export type InvoiceKind = 'export' | 'import';
export type InvoiceFilter = 'all' | 'validated' | 'not-validated' | 'dgi-verified';

export interface InvoiceCounts {
  total: number;
  validated: number;
  not_validated: number;
  dgi_verified: number;
  pending_invoicing: number;
}

export const EMPTY_COUNTS: InvoiceCounts = { total: 0, validated: 0, not_validated: 0, dgi_verified: 0, pending_invoicing: 0 };

interface StatCard {
  key: string;
  label: string;
  /** Solid mid-tone tile behind a white glyph — allowed a fixed hue by §4.32,
   *  because the glyph sits on a known ground rather than on the page. */
  grad: string;
  icon: ComponentType<{ className?: string }>;
  stat: keyof InvoiceCounts;
  filter?: InvoiceFilter;
}

const CARD: Record<string, StatCard> = {
  pending: { key: 'pending', label: 'Pending for Invoicing', grad: 'from-sky-500 to-blue-600', icon: Clock, stat: 'pending_invoicing' },
  validated: { key: 'validated', label: 'Validated', grad: 'from-emerald-500 to-green-600', icon: CheckCircle2, stat: 'validated', filter: 'validated' },
  'not-validated': { key: 'not-validated', label: 'Not Validated', grad: 'from-amber-500 to-orange-500', icon: AlertTriangle, stat: 'not_validated', filter: 'not-validated' },
  'dgi-verified': { key: 'dgi-verified', label: 'DGI Verified', grad: 'from-red-700 to-red-900', icon: FileCheck, stat: 'dgi_verified', filter: 'dgi-verified' },
  all: { key: 'all', label: 'Total Invoices', grad: 'from-indigo-500 to-violet-600', icon: FileText, stat: 'total', filter: 'all' },
};

// main orders the two lists differently — import reads Validated before Not
// Validated, export the other way round — so the order belongs to the module
// rather than to the shared component.
const ORDER: Record<InvoiceKind, string[]> = {
  import: ['pending', 'validated', 'not-validated', 'dgi-verified', 'all'],
  export: ['pending', 'not-validated', 'validated', 'dgi-verified', 'all'],
};

/**
 * main's stat row: a plain card carrying a small coloured icon tile, the figure
 * in full-strength foreground and its name beneath in muted small caps. The
 * whole card is the filter, and the active one is ringed and ticked.
 *
 * The card is a surface, not a colour — `card` and `text-foreground` rather than
 * a saturated ground with white type (§4.20/§4.32), so a row of five reads as
 * five figures instead of five blocks of colour, and it still works in dark mode.
 */
export function InvoiceStatCards({
  kind,
  counts,
  filter,
  onFilter,
  onPending,
}: {
  kind: InvoiceKind;
  counts: InvoiceCounts;
  filter: InvoiceFilter;
  onFilter: (f: InvoiceFilter) => void;
  onPending: () => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
      {ORDER[kind].map((key) => {
        const card = CARD[key]!;
        const active = !!card.filter && filter === card.filter;
        const Icon = card.icon;
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => (card.filter ? onFilter(card.filter) : onPending())}
            aria-pressed={card.filter ? active : undefined}
            className={clsx(
              'card relative p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md',
              active && 'ring-2 ring-primary border-primary',
            )}
            title={card.filter ? `Filter: ${card.label}` : 'Open the files waiting to be invoiced'}
          >
            {active && (
              <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            )}
            <span
              className={clsx(
                'mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm',
                card.grad,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="text-2xl font-bold leading-none tabular-nums text-foreground">
              {counts[card.stat].toLocaleString('en-US')}
            </div>
            <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {card.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function validationBadge(validated: number): { label: string; node: ReactNode } {
  const st =
    validated === 2
      ? { label: 'DGI VERIFIED', cls: 'bg-violet-100 dark:bg-violet-500/20 text-violet-800 dark:text-violet-300 border-violet-200 dark:border-violet-500/30' }
      : validated === 1
        ? { label: 'VALIDATED', cls: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30' }
        : { label: 'NOT VALIDATED', cls: 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30' };
  return {
    label: st.label,
    node: <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>,
  };
}

/** Created-date range, beside the DataTable's search box. */
export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input id="inv-date-from" type="date" aria-label="From date" title="From date" className="input h-8 w-auto min-w-0 text-sm"
        value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} />
      <span className="text-xs text-muted-foreground">to</span>
      <input id="inv-date-to" type="date" aria-label="To date" title="To date" className="input h-8 w-auto min-w-0 text-sm"
        value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} />
      {/* main's clear-date button — one click back to every date. */}
      <button type="button" onClick={() => onChange('', '')} disabled={!from && !to} title="Clear date filter"
        aria-label="Clear date filter" className="btn-neutral btn-icon disabled:opacity-50">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface ActionRow {
  id: number;
  invoice_ref: string | null;
  client_name: string | null;
  validated: number;
}

type RowAction = 'validate' | 'dgi' | 'delete';

const COPY: Record<RowAction, { title: string; body: string; verb: string; done: string; failed: string }> = {
  validate: { title: 'Validate invoice', body: 'Validating removes the draft watermark from the PDF. It can no longer be edited or deleted.', verb: 'Validate', done: 'has been validated', failed: 'Not validated' },
  dgi: { title: 'Mark DGI verified', body: 'Record that the DGI has verified this invoice.', verb: 'Mark verified', done: 'is marked DGI verified', failed: 'Not updated' },
  delete: { title: 'Delete invoice', body: 'The invoice is removed from the list and its files become available to invoice again.', verb: 'Delete', done: 'has been deleted', failed: 'Not deleted' },
};

/**
 * Validate / DGI-verify / delete, each asked first and reported after (§4.22).
 * Returns the row-action buttons and the dialogs to render once on the page.
 */
export function useInvoiceRowActions(kind: InvoiceKind, onDone: () => void) {
  const [pending, setPending] = useState<{ row: ActionRow; action: RowAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);

  async function run(): Promise<void> {
    if (!pending) return;
    const { row, action } = pending;
    setBusy(true);
    const res =
      action === 'delete'
        ? await safeFetchJson(`/api/v1/${kind}-invoices/${row.id}`, { method: 'DELETE' })
        : await safeFetchJson(`/api/v1/${kind}-invoices/${row.id}/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ validated: action === 'dgi' ? 2 : 1 }),
          });
    setBusy(false);
    setPending(null);
    const ref = row.invoice_ref || `Invoice #${row.id}`;
    if (!res.ok) {
      setResult({ status: 'error', title: COPY[action].failed, message: res.message || `${ref} could not be updated.` });
      return;
    }
    setResult({ status: 'success', title: action === 'delete' ? 'Deleted' : 'Saved', message: `${ref} ${COPY[action].done}.` });
    onDone();
  }

  function buttons(row: ActionRow): ReactNode {
    return (
      <>
        {row.validated === 0 && (
          <button type="button" title="Validate" onClick={() => setPending({ row, action: 'validate' })}
            className="btn-icon ms-1 bg-cyan-600 text-white shadow-sm hover:bg-cyan-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
        )}
        {row.validated === 1 && (
          <button type="button" title="Mark DGI Verified" onClick={() => setPending({ row, action: 'dgi' })}
            className="btn-icon ms-1 bg-violet-600 text-white shadow-sm hover:bg-violet-700">
            <ShieldCheck className="h-3.5 w-3.5" />
          </button>
        )}
      </>
    );
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={!!pending}
        title={pending ? COPY[pending.action].title : ''}
        confirmLabel={pending ? COPY[pending.action].verb : 'Confirm'}
        tone={pending?.action === 'delete' ? 'danger' : 'default'}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void run()}
      >
        {pending && (
          <>
            <strong className="text-foreground">{pending.row.invoice_ref || `Invoice #${pending.row.id}`}</strong>
            {pending.row.client_name ? ` (${pending.row.client_name})` : ''} — {COPY[pending.action].body}
          </>
        )}
      </ConfirmDialog>
      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );

  return {
    buttons,
    askDelete: (row: ActionRow) => setPending({ row, action: 'delete' }),
    dialogs,
  };
}
