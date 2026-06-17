'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { PAGE_SIZE_OPTIONS } from '@/lib/hooks/usePagedList';

const TEMPLATE_KEY = 'license_default';

// Status filter matches the seeded license_default workflow states. Keep in
// sync with src/db/seed/licenseStatuses.ts.
const STATES = [
  { value: '', label: 'All states' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'issued', label: 'Issued' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Columns to surface in the table. The dynamic target_table returns whatever
// columns license_t has, so we cherry-pick the meaningful ones rather than
// dumping the whole row.
type LicenseRow = {
  id: number;
  license_no: string;
  client_id: number;
  license_type_id: number;
  state: string;
  amount: string | number | null;
  currency: string | null;
  issue_date: string | null;
  created_at: string | null;
};

export default function LicensesListPage() {
  const [items, setItems] = React.useState<LicenseRow[]>([]);
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
        setError(json.error?.message ?? 'Failed to load licenses');
        return;
      }
      setItems(json.data as LicenseRow[]);
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
          <h1 className="text-2xl font-bold text-slate-900">Licenses</h1>
          <p className="text-sm text-slate-500 mt-1">
            Driven by case template <code>{TEMPLATE_KEY}</code> → target table{' '}
            <code>license_t</code>.
          </p>
        </div>
        <Link href="/licenses/new" className="btn-primary">
          <Plus className="h-4 w-4" /> Issue license
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
                <th>License no.</th>
                <th>State</th>
                <th>Client</th>
                <th>Type</th>
                <th className="text-right">Amount</th>
                <th>Issued</th>
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
                    No licenses {state ? `in state "${state}"` : 'yet'}.{' '}
                    <Link href="/licenses/new" className="text-primary-600 hover:underline">
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
                        href={`/licenses/${row.id}`}
                        className="text-primary-600 hover:underline"
                      >
                        {row.license_no}
                      </Link>
                    </td>
                    <td>
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        {row.state}
                      </span>
                    </td>
                    <td>{row.client_id}</td>
                    <td>{row.license_type_id}</td>
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
                    <td>{row.issue_date ?? '—'}</td>
                    <td className="text-right">
                      <Link
                        href={`/licenses/${row.id}`}
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
