'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, Plus } from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { PAGE_SIZE_OPTIONS } from '@/lib/hooks/usePagedList';

// Generic list page for any case_template_master_t row. Drives the
// /api/v1/cases/{templateKey} list endpoint with state filter +
// server-side pagination. Consumers wire it up by passing the
// template-specific knobs (states, columns, headings).

type Row = Record<string, unknown>;

export interface ColumnDef {
  /** Pulled from the row by key when no render() is supplied. */
  key: string;
  label: string;
  /** Custom cell render — receives the raw row dict. */
  render?: (row: Row) => React.ReactNode;
  /** Extra className on the <td>. */
  className?: string;
  /** Extra className on the <th>. */
  headerClassName?: string;
}

export interface CaseListPageProps {
  templateKey: string;
  title: string;
  subtitle: React.ReactNode;
  newHref: string;
  newLabel: string;
  /** Where a row's primary cell links. */
  getDetailHref: (row: Row) => string;
  /** State filter dropdown options. Always include `{ value: '', label: 'All states' }`. */
  states: Array<{ value: string; label: string }>;
  /**
   * Columns to display after the # column. The first column auto-wraps in
   * a Link to getDetailHref(row) so consumers don't repeat that boilerplate.
   * The trailing "Open →" link column is added automatically.
   */
  columns: ColumnDef[];
  /** Label for the empty-state link, e.g. "Issue one". */
  emptyVerb?: string;
  /**
   * Base URL for the per-template XLSX export endpoint, e.g.
   * `/api/v1/licenses/export`. When set, an "Export" button appears
   * next to the New button and links to `${exportHref}?state=<state>`
   * so the download honours the current filter.
   */
  exportHref?: string;
}

function defaultCellValue(row: Row, key: string): React.ReactNode {
  const v = row[key];
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function CaseListPage({
  templateKey,
  title,
  subtitle,
  newHref,
  newLabel,
  getDetailHref,
  states,
  columns,
  emptyVerb = 'Issue one',
  exportHref,
}: CaseListPageProps) {
  const [items, setItems] = React.useState<Row[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [state, setState] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [mounted, setMounted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Hydration guard — pagination UI gates itself on `mounted` to avoid SSR
  // mismatch. See [src/components/ui/PaginationFooter.tsx].
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      const res = await fetch(`/api/v1/cases/${templateKey}?${params}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Failed to load');
        return;
      }
      setItems(json.data as Row[]);
      setTotal(json.meta?.total ?? 0);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [templateKey, page, pageSize, state]);

  // Re-fetch when the filter / page changes. `load` is memoized via useCallback
  // so this only fires when one of its inputs actually changes.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;
  const totalColumns = 1 + columns.length + 1; // # + custom + Open →

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {exportHref && (
            <a
              href={`${exportHref}${state ? `?state=${encodeURIComponent(state)}` : ''}`}
              className="btn-secondary"
              title="Download current view as XLSX"
            >
              <Download className="h-4 w-4" /> Export
            </a>
          )}
          <Link href={newHref} className="btn-primary">
            <Plus className="h-4 w-4" /> {newLabel}
          </Link>
        </div>
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
            {states.map((s) => (
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
                {columns.map((c) => (
                  <th key={c.key} className={c.headerClassName}>
                    {c.label}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={totalColumns} className="text-center text-slate-500 py-8">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={totalColumns} className="text-center text-slate-500 py-8">
                    No rows {state ? `in state "${state}"` : 'yet'}.{' '}
                    <Link href={newHref} className="text-primary-600 hover:underline">
                      {emptyVerb}
                    </Link>
                    .
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((row, idx) => {
                  const href = getDetailHref(row);
                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="text-slate-500 font-medium">
                        {startIndex + idx + 1}
                      </td>
                      {columns.map((c, colIdx) => {
                        const content = c.render
                          ? c.render(row)
                          : defaultCellValue(row, c.key);
                        // The first user-defined column wraps in a Link
                        // automatically so consumers don't repeat the
                        // detail-href boilerplate per row.
                        const cell =
                          colIdx === 0 ? (
                            <Link
                              href={href}
                              className="text-primary-600 hover:underline font-medium"
                            >
                              {content}
                            </Link>
                          ) : (
                            content
                          );
                        return (
                          <td key={c.key} className={c.className}>
                            {cell}
                          </td>
                        );
                      })}
                      <td className="text-right">
                        <Link
                          href={href}
                          className="text-xs text-primary-600 hover:underline"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
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
    </>
  );
}
