'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronsUpDown, FileSpreadsheet, FilterX, ListFilter, Search } from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import ActionIcon from '@/components/ui/ActionIcon';
import { cellText, compareRows, matchesSearch } from '@/lib/dataTableSort';
import ColumnChooser from '@/components/ui/ColumnChooser';
import useColumnLayout from '@/lib/hooks/useColumnLayout';
import {
  activeFilterCount,
  applyLayout,
  matchesColumnFilters,
  type ColumnFilters,
} from '@/lib/dataTableColumns';

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
  /**
   * Where this table's saved column layout lives. Defaults to the route, which
   * is unique per screen and means no call site has to pass anything — only a
   * page rendering TWO tables needs to distinguish them.
   */
  tableId?: string;
  /** Set false for a table whose columns are not worth rearranging (rare). */
  customisableColumns?: boolean;
  /**
   * Per-column filter row. On by default in client mode.
   *
   * In SERVER mode it is off unless the caller wires `onColumnFiltersChange`,
   * for the same reason sorting is: this component only holds one page of rows,
   * so filtering them here would narrow the page and silently claim to have
   * narrowed the table. A control that lies is worse than one that is absent.
   */
  columnFilters?: boolean;
  onColumnFiltersChange?: (filters: ColumnFilters) => void;
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
  tableId,
  customisableColumns = true,
  columnFilters = true,
  onColumnFiltersChange,
}: DataTableProps<T>) {
  const [clientSearch, setClientSearch] = useState('');
  const [clientSort, setClientSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [filterValues, setFilterValues] = useState<ColumnFilters>({});
  const [filterRowOpen, setFilterRowOpen] = useState(false);

  const isServer = !!server;

  // §4.25 — which columns show, in what order. Keyed by route unless the caller
  // named the table, so every existing screen gets this without a code change.
  const pathname = usePathname();
  const layoutKey = tableId ?? pathname ?? 'default';
  const { layout, setLayout, reset, ready, customised } = useColumnLayout(layoutKey);

  // The declared columns until the saved view has been read — the server rendered
  // those, and swapping them mid-hydration is the mismatch `ready` exists to avoid.
  const visibleColumns = useMemo(
    () => (ready ? applyLayout(columns, layout) : columns),
    [ready, columns, layout],
  );

  // A filter row that cannot filter is not offered (see the prop's note).
  const canFilterColumns = columnFilters && (!isServer || !!onColumnFiltersChange);
  const search = isServer ? server.search : clientSearch;
  const sort = isServer ? (server.sort ?? null) : clientSort;

  // Client mode: filter, then sort. Server mode leaves `rows` exactly as given —
  // the endpoint has already done both.
  const prepared = useMemo(() => {
    if (isServer) return rows;
    let filtered = clientSearch.trim()
      ? rows.filter((row) => matchesSearch(row, columns, clientSearch))
      : rows;
    // Column filters narrow what the global search left, and are matched against
    // the VISIBLE columns only — a hidden column is not something the operator
    // can see a box for, so it must not be silently narrowing their list.
    if (activeFilterCount(filterValues) > 0) {
      filtered = filtered.filter((row) => matchesColumnFilters(row, visibleColumns, filterValues));
    }
    if (!clientSort) return filtered;
    return [...filtered].sort((a, b) => compareRows(a, b, columns, clientSort));
  }, [isServer, rows, columns, visibleColumns, clientSearch, clientSort, filterValues]);

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

  function setColumnFilter(key: string, value: string) {
    const next = { ...filterValues, [key]: value };
    setFilterValues(next);
    if (isServer) onColumnFiltersChange?.(next);
    else paged.resetPage(); // a fresh filter starts on page 1 (§4.9)
  }

  function clearColumnFilters() {
    setFilterValues({});
    if (isServer) onColumnFiltersChange?.({});
    else paged.resetPage();
  }

  const hasActions = !!actions;
  const colCount = visibleColumns.length + (serial ? 1 : 0) + (hasActions ? 1 : 0);
  const activeFilters = activeFilterCount(filterValues);
  const showToolbar = !!(
    title ||
    toolbar ||
    exportHref ||
    onExport ||
    searchable ||
    filters ||
    canFilterColumns ||
    customisableColumns
  );

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
            {canFilterColumns && (
              <button
                type="button"
                onClick={() => setFilterRowOpen((v) => !v)}
                aria-expanded={filterRowOpen}
                className="btn-neutral btn-sm"
                title="Filter each column"
              >
                <ListFilter className="h-4 w-4" />
                Filter
                {activeFilters > 0 && (
                  <span className="ms-1 rounded-full bg-primary-600 px-1.5 text-[10px] font-semibold text-white">
                    {activeFilters}
                  </span>
                )}
              </button>
            )}
            {customisableColumns && (
              <ColumnChooser
                columns={columns}
                layout={layout}
                onChange={setLayout}
                onReset={reset}
                customised={customised}
              />
            )}
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
              {visibleColumns.map((c) => {
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

            {/* One box per column, under its own header — an Excel autofilter
                row. Only rendered on request, because a permanently-present row
                of empty inputs is a second header competing with the real one. */}
            {canFilterColumns && filterRowOpen && (
              <tr className="bg-muted/30">
                {serial && (
                  <th className="p-1">
                    <button
                      type="button"
                      onClick={clearColumnFilters}
                      disabled={activeFilters === 0}
                      title="Clear every column filter"
                      aria-label="Clear every column filter"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    >
                      <FilterX className="h-4 w-4" />
                    </button>
                  </th>
                )}
                {visibleColumns.map((c) => {
                  const label = typeof c.header === 'string' ? c.header : c.key;
                  return (
                    <th key={c.key} className="p-1">
                      <input
                        className="input h-8 w-full min-w-0 text-xs font-normal"
                        placeholder="Filter…"
                        aria-label={`Filter by ${label}`}
                        value={filterValues[c.key] ?? ''}
                        onChange={(e) => setColumnFilter(c.key, e.target.value)}
                      />
                    </th>
                  );
                })}
                {hasActions && <th className="p-1" />}
              </tr>
            )}
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
                    {visibleColumns.map((c) => (
                      // `data-no-translate` — a body cell holds operator data, and
                      // the language switcher must not rewrite it. A client's short
                      // name, an MCA reference or a tonnage is not prose; the column
                      // HEADER above it is, and that one still translates.
                      <td
                        key={c.key}
                        data-no-translate
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
