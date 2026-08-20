'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Search, Eye, Edit2, Check, X, Receipt, Wallet, Layers,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import { formatDate as fmtDate } from '@/lib/formatDate';

// Payment Request — multi-stage approval workflow list. The form (create/edit)
// is a transaction-page (/payments/new, /payments/[id]); this page owns the
// stat-card filters, the server-side list, and the approve/reject actions.

type Stage = 'dept' | 'finance' | 'management' | 'under_process' | 'paid';

interface Row {
  id: number;
  requestee: string;
  beneficiary: string | null;
  client_name: string | null;
  pay_for: number | null;
  payment_type: string | null;
  currency_short_name: string | null;
  expense_type_name: string | null;
  amount: string;
  mca_count: number;
  created_at: string;
  created_by: number | null;
  department_name: string | null;
  location_name: string | null;
  dept_approval: number | null;
  finance_approval: number | null;
  management_approval: number | null;
  under_process: number | null;
  paid_approval: number | null;
}

const PAY_FOR = ['Import', 'Export', 'Local', 'Other', 'Pre Payment'];

const CARDS: Array<{ key: string; label: string; grad: string }> = [
  { key: 'all', label: 'Total', grad: 'from-indigo-500 to-violet-600' },
  { key: 'waiting_dept', label: 'Pending Dept', grad: 'from-amber-500 to-orange-500' },
  { key: 'waiting_finance', label: 'Pending Finance', grad: 'from-cyan-500 to-sky-600' },
  { key: 'waiting_mgmt', label: 'Pending Mgmt', grad: 'from-violet-500 to-purple-600' },
  { key: 'waiting_under_process', label: 'Under Process', grad: 'from-sky-500 to-blue-600' },
  { key: 'waiting_payment', label: 'Pending Payment', grad: 'from-orange-500 to-amber-600' },
  { key: 'paid', label: 'Paid', grad: 'from-emerald-500 to-teal-600' },
  { key: 'rejected', label: 'Rejected', grad: 'from-rose-500 to-red-600' },
];

function fmt(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? Number(v) : v ?? 0;
  return (Number.isFinite(n) ? (n as number) : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Derive the display status + the ONE actionable stage for a row.
function statusOf(r: Row): { label: string; cls: string; stage: Stage | null } {
  if ([r.dept_approval, r.finance_approval, r.management_approval, r.under_process, r.paid_approval].some((v) => v === -1))
    return { label: 'Rejected', cls: 'bg-rose-100 text-rose-800 border-rose-200', stage: null };
  if (r.paid_approval === 1) return { label: 'Paid', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', stage: null };
  if (r.dept_approval == null) return { label: 'Pending Dept', cls: 'bg-amber-100 text-amber-800 border-amber-200', stage: 'dept' };
  if (r.finance_approval == null) return { label: 'Pending Finance', cls: 'bg-cyan-100 text-cyan-800 border-cyan-200', stage: 'finance' };
  if (r.management_approval == null) return { label: 'Pending Mgmt', cls: 'bg-violet-100 text-violet-800 border-violet-200', stage: 'management' };
  if (r.payment_type === 'Bank' && r.under_process == null) return { label: 'Under Process', cls: 'bg-sky-100 text-sky-800 border-sky-200', stage: 'under_process' };
  return { label: 'Pending Payment', cls: 'bg-orange-100 text-orange-800 border-orange-200', stage: 'paid' };
}

export default function PaymentsPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [perms, setPerms] = useState<{ stages: Stage[] }>({ stages: [] });

  const [view, setView] = useState<Record<string, unknown> | null>(null);
  const [act, setAct] = useState<{ row: Row; stage: Stage } | null>(null);
  const [reason, setReason] = useState('');
  const [cashCollector, setCashCollector] = useState('');
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status_filter: filter });
      if (search.trim()) p.set('q', search.trim());
      const res = await fetch(`/api/v1/payments?${p}`);
      const j = await res.json();
      if (j.ok) { setItems(j.data); setTotal(j.meta?.total ?? 0); }
    } finally { setLoading(false); }
  }, [page, pageSize, filter, search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const loadCounts = useCallback(() => {
    fetch('/api/v1/payments/status-counts').then((r) => r.json()).then((j) => { if (j.ok) setCounts(j.data); }).catch(() => {});
  }, []);
  useEffect(() => { loadCounts(); }, [loadCounts]);
  useEffect(() => {
    fetch('/api/v1/payments/permissions').then((r) => r.json()).then((j) => { if (j.ok) setPerms({ stages: j.data.stages }); }).catch(() => {});
  }, []);

  async function openView(id: number) {
    setView(null);
    const res = await fetch(`/api/v1/payments/${id}`);
    const j = await res.json();
    if (j.ok) setView(j.data);
  }

  function openAction(row: Row, stage: Stage) {
    setAct({ row, stage }); setReason(''); setCashCollector(String(row ? '' : '')); setActErr(null);
  }

  async function submitApprove() {
    if (!act) return;
    setBusy(true); setActErr(null);
    try {
      const res = await fetch(`/api/v1/payments/${act.row.id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: act.stage, cash_collector: cashCollector || undefined }),
      });
      const j = await res.json();
      if (!j.ok) { setActErr(j.error?.message ?? 'Failed'); return; }
      setAct(null); load(); loadCounts();
    } finally { setBusy(false); }
  }

  async function submitReject() {
    if (!act) return;
    if (!reason.trim()) { setActErr('A reason is required'); return; }
    setBusy(true); setActErr(null);
    try {
      const res = await fetch(`/api/v1/payments/${act.row.id}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: act.stage, reason: reason.trim() }),
      });
      const j = await res.json();
      if (!j.ok) { setActErr(j.error?.message ?? 'Failed'); return; }
      setAct(null); load(); loadCounts();
    } finally { setBusy(false); }
  }

  const canStage = useMemo(() => new Set(perms.stages), [perms.stages]);
  const mcaLines = (view?.mca_data as Array<{ mca_ref: string; amount: number }> | undefined) ?? [];

  return (
    <>
      <div className="card overflow-hidden mb-4">
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600" />
        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary-600" /> Payment Requests
          </h1>
          <Link href="/payments/new" className="btn-primary"><Plus className="h-4 w-4" /> New Payment Request</Link>
        </div>
      </div>

      {/* Stat cards / filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 mb-4">
        {CARDS.map((card) => {
          const value = card.key === 'all' ? (counts.total ?? 0) : (counts[card.key] ?? 0);
          const active = filter === card.key;
          return (
            <button
              key={card.key} type="button"
              onClick={() => { setFilter(card.key); setPage(1); }}
              className={`text-left rounded-xl bg-gradient-to-br ${card.grad} text-white p-3 shadow-sm transition hover:shadow-md ${active ? 'ring-2 ring-offset-2 ring-slate-900/40' : ''}`}
            >
              <div className="text-2xl font-bold leading-none">{value}</div>
              <div className="text-[11px] mt-1 opacity-90 uppercase tracking-wide">{card.label}</div>
            </button>
          );
        })}
      </div>

      {/* serial={false}: the request number IS the reference operators quote,
          so it stands in for the running serial rather than sitting beside it. */}
      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        title="List of Payment Requests"
        searchPlaceholder="Search requestee, beneficiary, client…"
        emptyMessage="No payment requests yet — raise the first one."
        serial={false}
        columns={[
          { key: 'id', header: '#', className: 'font-mono font-semibold', render: (r: Row) => `#${r.id}` },
          { key: 'requestee', header: 'Requestee', sortable: true, className: 'font-medium' },
          { key: 'beneficiary', header: 'Beneficiary', sortable: true },
          { key: 'client_name', header: 'Client', sortable: true },
          {
            key: 'pay_for',
            header: 'For',
            render: (r: Row) => (r.pay_for != null ? PAY_FOR[r.pay_for] ?? '—' : '—'),
          },
          { key: 'payment_type', header: 'Type', sortable: true },
          { key: 'currency_short_name', header: 'Currency' },
          {
            key: 'expense_type_name',
            header: 'Expense',
            className: 'max-w-[10rem] truncate',
          },
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            sortable: true,
            className: 'tabular-nums font-semibold',
            render: (r: Row) => fmt(r.amount),
          },
          {
            key: 'mca_count',
            header: 'Refs',
            align: 'center',
            render: (r: Row) =>
              r.mca_count > 0 ? (
                <span className="inline-flex min-w-[1.5rem] justify-center rounded-full bg-muted px-1.5 py-0.5 text-foreground">
                  {r.mca_count}
                </span>
              ) : (
                <span className="text-muted-foreground">0</span>
              ),
          },
          {
            key: 'status',
            header: 'Status',
            value: (r: Row) => statusOf(r).label,
            render: (r: Row) => {
              const st = statusOf(r);
              return (
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                  {st.label}
                </span>
              );
            },
          },
          {
            key: 'created_at',
            header: 'Date',
            sortable: true,
            render: (r: Row) => fmtDate(r.created_at),
          },
        ]}
        actions={(r) => {
          const st = statusOf(r);
          const canAct = st.stage != null && canStage.has(st.stage);
          return {
            view: () => openView(r.id),
            edit: `/payments/${r.id}`,
            // The one stage this row is actually waiting on — an approval, so it
            // wears the approve colour (§4.26).
            extra:
              canAct && st.stage ? (
                <button
                  type="button"
                  onClick={() => openAction(r, st.stage as Stage)}
                  title={`Act: ${st.label}`}
                  className="btn-approve btn-sm ms-1 h-7 px-2 text-[11px]"
                >
                  <Check className="h-3.5 w-3.5" /> Act
                </button>
              ) : null,
          };
        }}
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
          <div className="card w-full max-w-2xl my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-indigo-500 to-purple-600">
              <h2 className="font-semibold flex items-center gap-2"><Receipt className="h-5 w-5" /> Payment Request #{String(view.id)}</h2>
              <button type="button" onClick={() => setView(null)} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 max-h-[72vh] overflow-y-auto">
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                {([
                  ['Department', view.department_name], ['Location', view.location_name], ['Beneficiary', view.beneficiary],
                  ['Requestee', view.requestee], ['Client', view.client_name], ['Payment For', view.pay_for != null ? PAY_FOR[Number(view.pay_for)] : '—'],
                  ['Payment Type', view.payment_type], ['Currency', view.currency_short_name], ['Amount', fmt(view.amount as string)],
                  ['Expense Type', view.expense_type_name], ['Cash Collector', view.cash_collector], ['Chargeback', view.chargeback ? fmt(view.chargeback as string) : '—'],
                ] as Array<[string, unknown]>).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{k}</dt>
                    <dd className="text-slate-800 dark:text-slate-100">{v === null || v === undefined || v === '' ? '—' : String(v)}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Motif</div>
                <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-2 text-sm whitespace-pre-wrap">{String(view.motif ?? '—')}</div>
              </div>
              {mcaLines.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">References ({mcaLines.length})</div>
                  <table className="table-base text-xs">
                    <thead><tr><th>#</th><th>Reference</th><th className="text-right">Amount</th></tr></thead>
                    <tbody>
                      {mcaLines.map((m, i) => (<tr key={i}><td>{i + 1}</td><td className="font-mono">{m.mca_ref}</td><td className="text-right tabular-nums">{fmt(m.amount)}</td></tr>))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Timeline */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                {([['Dept', 'dept_approval', 'dept_approved_by_name'], ['Finance', 'finance_approval', 'finance_approved_by_name'], ['Mgmt', 'management_approval', 'management_approved_by_name'], ['Under Proc.', 'under_process', 'under_process_by_name'], ['Paid', 'paid_approval', 'paid_approved_by_name']] as Array<[string, string, string]>).map(([label, ap, by]) => {
                  const v = view[ap] as number | null;
                  const badge = v === 1 ? 'bg-emerald-100 text-emerald-700' : v === -1 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-muted-foreground';
                  return (
                    <div key={label} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-center">
                      <div className="font-semibold text-slate-600 dark:text-slate-300 mb-1">{label}</div>
                      <span className={`inline-block rounded-full px-2 py-0.5 ${badge}`}>{v === 1 ? 'Approved' : v === -1 ? 'Rejected' : 'Pending'}</span>
                      {view[by] ? <div className="mt-1 text-muted-foreground truncate">{String(view[by])}</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-200 dark:border-slate-800 px-5 py-3">
              <button type="button" onClick={() => setView(null)} className="btn-secondary"><X className="h-4 w-4" /> Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Approve / reject modal */}
      {act && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 sm:p-8 overflow-y-auto" onClick={() => setAct(null)}>
          <div className="card w-full max-w-md my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-violet-500 to-purple-600">
              <h2 className="font-semibold capitalize">{act.stage.replace('_', ' ')} — Payment #{act.row.id}</h2>
              <button type="button" onClick={() => setAct(null)} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              {actErr && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{actErr}</div>}
              <div className="text-sm text-slate-600 dark:text-slate-300">
                {act.row.beneficiary} · {fmt(act.row.amount)} {act.row.currency_short_name} · {act.row.payment_type}
              </div>
              {act.stage === 'paid' && (
                <div>
                  <label className="label required">Cash Collector</label>
                  <input required className="input" value={cashCollector} onChange={(e) => setCashCollector(e.target.value)} placeholder="Collector name" />
                </div>
              )}
              <div>
                <label className="label">Rejection reason <span className="text-muted-foreground">(only if rejecting)</span></label>
                <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…" />
              </div>
            </div>
            {/* §4.21 — a way out that is not the X or the backdrop. This modal
                commits an approval, so leaving without deciding must be an
                explicit, labelled choice. */}
            <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3">
              <button type="button" onClick={() => setAct(null)} disabled={busy} className="btn-secondary">Cancel</button>
              <button type="button" onClick={submitReject} disabled={busy} className="btn-danger"><X className="h-4 w-4" /> Reject</button>
              <button type="button" onClick={submitApprove} disabled={busy} className="btn-primary"><Check className="h-4 w-4" /> {busy ? '…' : 'Approve'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
