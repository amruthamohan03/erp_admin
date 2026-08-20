'use client';

// §2 step 5 — shared list page for Export + Import invoices. The create/edit form
// is a transaction-page (/{kind}-invoices/new, /{kind}-invoices/[id]); this page
// owns the stat-card filters, the server-side list, and validate/delete actions.
// One component drives both kinds (§4.10); the page shims pass `kind`.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Edit2, Trash2, CheckCircle2, FileText, Layers, X } from 'lucide-react';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';

type Kind = 'export' | 'import';

interface Row {
  id: number;
  invoice_ref: string | null;
  client_id: number | null;
  client_name: string | null;
  invoice_date: string | null;
  validated: number;
  total_usd: number;
  created_at: string;
}

interface Stats {
  total: number;
  pending: number;
  validated: number;
  dgi: number;
}

const CARDS: Array<{ key: string; label: string; grad: string; stat: keyof Stats }> = [
  { key: 'all', label: 'Total', grad: 'from-indigo-500 to-violet-600', stat: 'total' },
  { key: 'pending', label: 'Pending', grad: 'from-amber-500 to-orange-500', stat: 'pending' },
  { key: 'validated', label: 'Validated', grad: 'from-emerald-500 to-teal-600', stat: 'validated' },
  { key: 'dgi', label: 'DGI Verified', grad: 'from-cyan-500 to-sky-600', stat: 'dgi' },
];

function fmt(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusOf(v: number): { label: string; cls: string } {
  if (v === 2) return { label: 'DGI Verified', cls: 'bg-cyan-100 text-cyan-800 border-cyan-200' };
  if (v === 1) return { label: 'Validated', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  return { label: 'Pending', cls: 'bg-amber-100 text-amber-800 border-amber-200' };
}

export default function InvoiceListPage({ kind }: { kind: Kind }) {
  const base = `/api/v1/${kind}-invoices`;
  const title = kind === 'export' ? 'Export Invoices' : 'Import Invoices';

  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, validated: 0, dgi: 0 });
  const [confirm, setConfirm] = useState<{ row: Row; action: 'validate' | 'dgi' | 'delete' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status: filter });
      if (search.trim()) p.set('q', search.trim());
      const res = await fetch(`${base}?${p}`);
      const j = await res.json();
      if (j.ok) {
        setItems(j.data);
        setTotal(j.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [base, page, pageSize, filter, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const loadStats = useCallback(() => {
    fetch(`${base}/statistics`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setStats(j.data);
      })
      .catch(() => {});
  }, [base]);
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function runAction() {
    if (!confirm) return;
    setBusy(true);
    setErr(null);
    try {
      const { row, action } = confirm;
      const res =
        action === 'delete'
          ? await fetch(`${base}/${row.id}`, { method: 'DELETE' })
          : await fetch(`${base}/${row.id}/validate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ validated: action === 'dgi' ? 2 : 1 }),
            });
      const j = await res.json();
      if (!j.ok) {
        setErr(j.error?.message ?? 'Action failed');
        return;
      }
      setConfirm(null);
      load();
      loadStats();
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;
  const confirmText = useMemo(() => {
    if (!confirm) return '';
    if (confirm.action === 'delete') return 'Delete this invoice? It will be hidden from the list.';
    if (confirm.action === 'dgi') return 'Mark this invoice as DGI-verified?';
    return 'Validate this invoice? It becomes read-only afterwards.';
  }, [confirm]);

  return (
    <>
      <div className="card overflow-hidden mb-4">
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600" />
        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary-600" /> {title}
          </h1>
          <Link href={`/${kind}-invoices/new`} className="btn-primary">
            <Plus className="h-4 w-4" /> New {kind === 'export' ? 'Export' : 'Import'} Invoice
          </Link>
        </div>
      </div>

      {/* Stat cards / filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {CARDS.map((card) => {
          const active = filter === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => {
                setFilter(card.key);
                setPage(1);
              }}
              className={`text-left rounded-xl bg-gradient-to-br ${card.grad} text-white p-3 shadow-sm transition hover:shadow-md ${active ? 'ring-2 ring-offset-2 ring-slate-900/40' : ''}`}
            >
              <div className="text-2xl font-bold leading-none">{stats[card.stat]}</div>
              <div className="text-[11px] mt-1 opacity-90 uppercase tracking-wide">{card.label}</div>
            </button>
          );
        })}
      </div>

      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        title={`${kind === 'export' ? 'Export' : 'Import'} Invoices`}
        searchPlaceholder="Search invoice ref, client..."
        emptyMessage="No invoices yet — create the first one."
        columns={[
          { key: 'invoice_ref', header: 'Invoice Ref', className: 'font-medium' },
          { key: 'client_name', header: 'Client' },
          // Only the export list carries a separate invoice date.
          ...(kind === 'export'
            ? [{ key: 'invoice_date', header: 'Invoice Date' } as DataTableColumn<Row>]
            : []),
          {
            key: 'total_usd',
            header: 'Total (USD)',
            align: 'right',
            className: 'tabular-nums font-semibold',
            render: (r: Row) => fmt(r.total_usd),
          },
          {
            key: 'validated',
            header: 'Status',
            value: (r: Row) => statusOf(r.validated).label,
            render: (r: Row) => {
              const st = statusOf(r.validated);
              return (
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                  {st.label}
                </span>
              );
            },
          },
          { key: 'created_at', header: 'Created' },
        ]}
        actions={(r) => ({
          edit: `/${kind}-invoices/${r.id}`,
          remove: r.validated === 0 ? () => setConfirm({ row: r, action: 'delete' }) : undefined,
          extra: (
            <>
              {r.validated === 0 && (
                <button
                  type="button"
                  onClick={() => setConfirm({ row: r, action: 'validate' })}
                  title="Validate"
                  className="btn-approve btn-sm ms-1 h-7 px-2 text-[11px]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Validate
                </button>
              )}
              {r.validated === 1 && (
                <button
                  type="button"
                  onClick={() => setConfirm({ row: r, action: 'dgi' })}
                  title="Mark DGI verified"
                  className="btn-sm ms-1 h-7 rounded-md bg-cyan-600 px-2 text-[11px] font-medium text-white hover:bg-cyan-700"
                >
                  DGI
                </button>
              )}
            </>
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

      {confirm && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 sm:p-8 overflow-y-auto"
          onClick={() => setConfirm(null)}
        >
          <div className="card w-full max-w-md my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-violet-500 to-purple-600">
              <h2 className="font-semibold">Confirm — Invoice #{confirm.row.id}</h2>
              <button type="button" onClick={() => setConfirm(null)} className="rounded-md p-1 hover:bg-white/20">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {err && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
              <p className="text-sm text-slate-600 dark:text-slate-300">{confirmText}</p>
              <div className="text-sm text-muted-foreground">
                {confirm.row.invoice_ref || '—'} · {confirm.row.client_name || 'N/A'} · {fmt(confirm.row.total_usd)} USD
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3">
              <button type="button" onClick={() => setConfirm(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={runAction}
                disabled={busy}
                className={confirm.action === 'delete' ? 'btn-danger' : 'btn-primary'}
              >
                {busy ? '…' : confirm.action === 'delete' ? 'Delete' : confirm.action === 'dgi' ? 'Mark DGI' : 'Validate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
