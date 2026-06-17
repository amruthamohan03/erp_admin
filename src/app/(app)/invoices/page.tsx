'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { PAGE_SIZE_OPTIONS } from '@/lib/hooks/usePagedList';

const TEMPLATE_KEY = 'invoice_default';

// Filter states match the seeded invoice_default workflow. Keep in sync
// with src/db/seed/invoiceStatuses.ts.
const STATES = [
  { value: '', label: 'All states' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'issued', label: 'Issued' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

type InvoiceRow = {
  id: number;
  invoice_number: string;
  client_id: number;
  license_id: number | null;
  state: string;
  amount: string | number | null;
  tax: string | number | null;
  total_amount: string | number | null;
  currency: string | null;
  issue_date: string | null;
  due_date: string | null;
};

export default function InvoicesListPage() {
  const [items, setItems] = React.useState<InvoiceRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [state, setState] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [mounted, setMounted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (state) params.set('state', state);
      const res = await fetch(`/api/v1/cases/${TEMPLATE_KEY}?${params}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Failed to load invoices');
        return;
      }
      setItems(json.data as InvoiceRow[]);
      setTotal(json.meta?.total ?? 0);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, state]);

  React.useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">
            Driven by case template <code>{TEMPLATE_KEY}</code> → target table{' '}
            <code>invoice_t</code>.
          </p>
        </div>
        <Link href="/invoices/new" className="btn-primary">
          <Plus className="h-4 w-4" /> Issue invoice
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          <label className="text-sm text-slate-600">Filter by state:</label>
          <select
            className="input max-w-[180px]"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(1);
            }}
          >
            {STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Invoice no.</th>
                <th>State</th>
                <th>Client</th>
                <th>License</th>
                <th className="text-right">Amount</th>
                <th>Due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-500 py-8">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-500 py-8">
                    No invoices {state ? `in state "${state}"` : 'yet'}.{' '}
                    <Link href="/invoices/new" className="text-primary-600 hover:underline">
                      Issue one
                    </Link>
                    .
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-medium">
                      <Link
                        href={`/invoices/${row.id}`}
                        className="text-primary-600 hover:underline"
                      >
                        {row.invoice_number}
                      </Link>
                    </td>
                    <td>
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        {row.state}
                      </span>
                    </td>
                    <td>{row.client_id}</td>
                    <td>{row.license_id ?? '—'}</td>
                    <td className="text-right">
                      {row.amount != null ? (
                        <>
                          {row.amount}{' '}
                          <span className="text-xs text-slate-400">
                            {row.currency ?? ''}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{row.due_date ?? '—'}</td>
                    <td className="text-right">
                      <Link
                        href={`/invoices/${row.id}`}
                        className="text-xs text-primary-600 hover:underline"
                      >
                        Open →
                      </Link>
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
          totalRows={total}
          totalPages={totalPages}
          startIndex={startIndex}
          mounted={mounted}
        />
      </div>
    </DashboardShell>
  );
}
