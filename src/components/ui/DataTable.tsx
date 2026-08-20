'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronsUpDown, FileSpreadsheet, Search } from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import ActionIcon from '@/components/ui/ActionIcon';
import { cellText, compareRows, matchesSearch } from '@/lib/dataTableSort';

// §4.25 — the one table every list screen renders.
//
// Columns are declared as DATA, not markup, so search, sorting, pagination, the
// action column, the loading skeleton and the empty state have exactly one
// implementation. Sixty-six hand-built tables is why those had all drifted.
//
// Two modes:
//   client (default) — the caller hands over every row and this component filters,
//                      sorts and pages them. Right for anything that fits one fetch.
//   server           — pass `server`, and the component renders the same controls
//                      but reports intent instead of acting. Right past ~500 rows.
// §4.9 picks between them; the markup is identical either way, so a list can move
// from one to the other without the screen changing.

export interface DataTableColumn<T> {
  /** Field name; doubles as the sort key and the default cell accessor. */
  key: string;
  header: ReactNode;
  /** Custom cell. Omit for the raw value, with an em dash for null. */
  render?: (row: T, index: number) => ReactNode;
  /** Comparable/searchable value when the cell is computed rather than a field. */
  value?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  headerClassName?: string;
}

/** The row actions a module offers. Omitted keys simply do not render. */
export interface DataTableRowActions {
  view?: () => void;
  /** An href navigates; a function handles it in place. */
  edit?: string | (() => void);
  remove?: () => void;
  restore?: () => void;
  /** Module-specific actions, rendered after the reserved three (§4.20). */
  extra?: ReactNode;
}

export interface DataTableServerMode {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  search: string;
  onSearchChange: (q: string) => void;
  sort?: { key: string; dir: 'asc' | 'desc' } | null;
  onSortChange?: (sort: { key: string; dir: 'asc' | 'desc' } | null) => void;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  loading?: boolean;
  rowKey?: (row: T) => string | number;
  actions?: (row: T) => DataTableRowActions;
  /** Placeholder names the fields searched, per §4.9. */
  searchPlaceholder?: string;
  /** Set false for a list with nothing worth searching (rare). */
  searchable?: boolean;
  /** Filter controls — SearchableSelects (§4.16) — shown beside the search box. */
  filters?: ReactNode;
  /** Buttons for the header row: "New X", bulk actions. */
  toolbar?: ReactNode;
  /** Renders the standard green Excel button (§4.20 / §4.26). */
  exportHref?: string;
  onExport?: () => void;
  /** Names what is missing AND the action that fixes it — never just "No data". */
  emptyMessage?: ReactNode;
  /** The `#` column. Off for tables whose own reference is the identity. */
  serial?: boolean;
  title?: ReactNode;
  server?: DataTableServerMode;
}

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

export default function DataTable<T>({
  rows,
  columns,
  loading = false,
  rowKey,
  actions,
  searchPlaceholder,
  searchable = true,
  filters,
  toolbar,
  exportHref,
  onExport,
  emptyMessage = 'Nothing here yet.',
  serial = true,
  title,
  server,
}: DataTableProps<T>) {
  const [clientSearch, setClientSearch] = useState('');
  const [clientSort, setClientSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const isServer = !!server;
  const search = isServer ? server.search : clientSearch;
  const sort = isServer ? (server.sort ?? null) : clientSort;

  // Client mode: filter, then sort. Server mode leaves `rows` exactly as given —
  // the endpoint has already done both.
  const prepared = useMemo(() => {
    if (isServer) return rows;
    const filtered = clientSearch.trim()
      ? rows.filter((row) => matchesSearch(row, columns, clientSearch))
      : rows;
    if (!clientSort) return filtered;
    return [...filtered].sort((a, b) => compareRows(a, b, columns, clientSort));
  }, [isServer, rows, columns, clientSearch, clientSort]);

  const paged = usePagedList(prepared);

  // One set of numbers for the footer, whichever mode is active.
  const view = isServer
    ? {
        page: server.page,
        setPage: server.onPageChange,
        pageSize: server.pageSize,
        setPageSize: server.onPageSizeChange,
        totalRows: server.total,
        totalPages: Math.max(1, Math.ceil(server.total / server.pageSize)),
        startIndex: (server.page - 1) * server.pageSize,
        items: rows,
        mounted: paged.mounted,
      }
    : {
        page: paged.page,
        setPage: paged.setPage,
        pageSize: paged.pageSize,
        setPageSize: paged.setPageSize,
        totalRows: paged.totalRows,
        totalPages: paged.totalPages,
        startIndex: paged.startIndex,
        items: paged.paged,
        mounted: paged.mounted,
      };

  function setSearch(next: string) {
    if (isServer) {
      server.onSearchChange(next);
    } else {
      setClientSearch(next);
      paged.resetPage(); // a fresh filter starts on page 1 (§4.9)
    }
  }

  function toggleSort(key: string) {
    // asc → desc → off, so a column can be un-sorted without a reset control.
    const next =
      sort?.key !== key
        ? { key, dir: 'asc' as const }
        : sort.dir === 'asc'
          ? { key, dir: 'desc' as const }
          : null;
    if (isServer) server.onSortChange?.(next);
    else setClientSort(next);
  }

  // A header only offers sorting when something can actually act on it: in server
  // mode that means the caller wired onSortChange. Rendering the affordance without
  // it gives a control that silently does nothing.
  const canSort = (c: DataTableColumn<T>) => !!c.sortable && (!isServer || !!server.onSortChange);

  const hasActions = !!actions;
  const colCount = columns.length + (serial ? 1 : 0) + (hasActions ? 1 : 0);
  const showToolbar = !!(title || toolbar || exportHref || onExport || searchable || filters);

  return (
    <div className="card">
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            {title && <span className="font-semibold text-foreground">{title}</span>}
            {searchable && (
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="input w-64 ps-9 text-sm"
                  placeholder={searchPlaceholder ?? 'Search…'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label={searchPlaceholder ?? 'Search'}
                />
              </div>
            )}
            {filters}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {exportHref ? (
              <a href={exportHref} className="btn-excel btn-sm" title="Download as Excel">
                <FileSpreadsheet className="h-4 w-4" /> Export
              </a>
            ) : onExport ? (
              <button type="button" onClick={onExport} className="btn-excel btn-sm" title="Download as Excel">
                <FileSpreadsheet className="h-4 w-4" /> Export
              </button>
            ) : null}
            {toolbar}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              {serial && <th className="w-16">#</th>}
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={[ALIGN[c.align ?? 'left'], c.headerClassName ?? ''].join(' ').trim()}
                  >
                    {canSort(c) ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        aria-label={`Sort by ${typeof c.header === 'string' ? c.header : c.key}`}
                      >
                        {c.header}
                        {active ? (
                          sort.dir === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {hasActions && <th className="w-32 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {/* Skeleton rows rather than one "Loading…" cell, so the table keeps
                its height and the page does not jump when the data lands. */}
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  {Array.from({ length: colCount }).map((__, j) => (
                    <td key={j}>
                      <div className="h-4 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && view.items.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}

            {!loading &&
              view.items.map((row, idx) => {
                const act = actions?.(row);
                return (
                  <tr key={rowKey ? rowKey(row) : idx} className="hover:bg-accent/40">
                    {serial && (
                      // §4.9 — a running number, never the primary key.
                      <td className="font-medium text-muted-foreground">
                        {view.startIndex + idx + 1}
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={[ALIGN[c.align ?? 'left'], c.className ?? ''].join(' ').trim()}
                      >
                        {c.render ? c.render(row, idx) : cellText(row, c) || '—'}
                      </td>
                    ))}
                    {hasActions && (
                      <td className="whitespace-nowrap text-right">
                        {/* Reserved hues, always in this order (§4.20). */}
                        {act?.view && (
                          <button type="button" onClick={act.view} title="View" className="ico-view">
                            <ActionIcon action="view" className="h-4 w-4" />
                          </button>
                        )}
                        {typeof act?.edit === 'string' ? (
                          <Link href={act.edit} title="Edit" className="ico-edit ms-1">
                            <ActionIcon action="edit" className="h-4 w-4" />
                          </Link>
                        ) : act?.edit ? (
                          <button type="button" onClick={act.edit} title="Edit" className="ico-edit ms-1">
                            <ActionIcon action="edit" className="h-4 w-4" />
                          </button>
                        ) : null}
                        {act?.restore && (
                          <button
                            type="button"
                            onClick={act.restore}
                            title="Restore"
                            className="ico-restore ms-1"
                          >
                            <ActionIcon action="restore" className="h-4 w-4" />
                          </button>
                        )}
                        {act?.remove && (
                          <button
                            type="button"
                            onClick={act.remove}
                            title="Delete"
                            className="ico-delete ms-1"
                          >
                            <ActionIcon action="delete" className="h-4 w-4" />
                          </button>
                        )}
                        {act?.extra}
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <PaginationFooter
        page={view.page}
        setPage={view.setPage}
        pageSize={view.pageSize}
        setPageSize={view.setPageSize}
        totalRows={view.totalRows}
        totalPages={view.totalPages}
        startIndex={view.startIndex}
        mounted={view.mounted}
      />
    </div>
  );
}
