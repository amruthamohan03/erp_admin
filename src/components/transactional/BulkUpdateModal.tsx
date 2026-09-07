'use client';

// Filter-scoped mass edit — ONE component for Imports (§9) and Exports (§8).
//
// The two used to be byte-near copies of each other (§4.10), which is how they
// drifted: only one showed the loading date, only one numbered rows from the
// page offset, and a fix to one never reached the other.
//
// What it does: renders exactly the fields the active "pending" dashboard
// filters map to (the caller's FIELD_META / bulkFields.ts), plus whatever
// read-only identity columns those filters ask for, and submits every cell the
// operator changed in one transaction.
//
// PAGED server-side (§4.9). A pending filter can match every consignment on the
// system, and loading them all meant a slow request and a browser laying out
// thousands of inputs before the modal would open. Edits are held by row id, so
// they survive paging — page through, fill in what you need, save once.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, RotateCcw, Save, Search, X } from 'lucide-react';
import { safeFetchJson } from '@/lib/safeFetch';
import PaginationFooter from '@/components/ui/PaginationFooter';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { fetchMasterOptions, type SelectOption } from '@/lib/selectOptions';
import { CLIENT_OPTION_LABEL_FIELD } from '@/lib/clientOptions';

interface BulkData {
  relevant_fields: string[];
  readonly_fields: string[];
  rows: Record<string, unknown>[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface BulkFieldMeta {
  label: string;
  type: 'date' | 'number' | 'text';
}

/**
 * One dropdown in the modal's own filter bar (§4.16 renders it as a
 * SearchableSelect). Declared as data by the caller rather than hand-built, so
 * a module adds a filter with one row here and nothing else.
 *
 * `key` is the query parameter the endpoint reads, so it must match a field on
 * that module's BulkExtra. Options come from `source`/`labelField` through the
 * shared master fetcher — never a private copy (§4.10).
 */
export interface BulkFilterDef {
  key: string;
  label: string;
  source: string;
  labelField: string;
  /** The "no filter" row, e.g. "All Clients". */
  emptyLabel: string;
}

export interface BulkLeadColumn {
  header: string;
  render: (row: Record<string, unknown>) => ReactNode;
}

export interface BulkUpdateModalProps {
  /** Selects the endpoints: /api/v1/{module}/bulk-update-data and /bulk-update. */
  module: 'imports' | 'exports';
  /** Field labels and input types for the columns the filters resolve to. */
  fieldMeta: Record<string, BulkFieldMeta>;
  statusFilters: string[];
  /** The list screen's active scope, already flattened to query values. */
  scope: Record<string, string | number | undefined>;
  /** The modal's own filter bar. Seeded from `scope`, then owned by the modal. */
  filters?: readonly BulkFilterDef[];
  /** Read-only columns between Client and the editable ones (e.g. Loading Date). */
  leadColumns?: readonly BulkLeadColumn[];
  /** What a row is called, for the empty state and the save button. */
  noun: { one: string; many: string };
  onClose: () => void;
  onSaved: (count: number) => void;
}

const inputType = (t: string | undefined): string =>
  t === 'date' ? 'date' : t === 'number' ? 'number' : 'text';

/**
 * The three filters a consignment list is narrowed by, shared by Imports and
 * Exports (§4.10 — the same three, declared once). Both tables carry
 * `client_id`, `transport_mode` and `type_of_goods`, and both endpoints read
 * these exact query parameters, so neither module needs its own copy.
 *
 * A module that needs a different set passes its own array; this is the default
 * shape, not a rule.
 *
 * §4.15 — the client picker is labelled by short code via the shared resolver,
 * never `company_name`.
 */
export const CONSIGNMENT_FILTERS: readonly BulkFilterDef[] = [
  {
    key: 'client_id',
    label: 'Client',
    source: 'clients',
    labelField: CLIENT_OPTION_LABEL_FIELD,
    emptyLabel: 'All Clients',
  },
  {
    key: 'transport_mode_id',
    label: 'Transport Mode',
    source: 'transport-modes',
    labelField: 'transport_mode_name',
    emptyLabel: 'All Transport Modes',
  },
  {
    key: 'type_of_goods_id',
    label: 'Type of Goods',
    source: 'goods-types',
    labelField: 'goods_type',
    emptyLabel: 'All Goods Types',
  },
];

/**
 * Module-level so the "no filters" case has a STABLE identity. A `= []` default
 * in the parameter list allocates a fresh array on every render, which the
 * options-loading effect would read as a changed filter set and refetch forever.
 */
const NO_FILTERS: readonly BulkFilterDef[] = [];
const NO_LEAD_COLUMNS: readonly BulkLeadColumn[] = [];


export default function BulkUpdateModal({
  module,
  fieldMeta,
  statusFilters,
  scope,
  filters = NO_FILTERS,
  leadColumns = NO_LEAD_COLUMNS,
  noun,
  onClose,
  onSaved,
}: BulkUpdateModalProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BulkData | null>(null);
  /**
   * Only the cells the operator actually CHANGED, keyed by row id.
   *
   * Not seeded from the stored values: that made every loaded row look edited,
   * so saving stamped updated_by/updated_at on rows nobody had touched — and
   * with paging it would have been impossible to tell a real edit on page 1
   * from an untouched row on page 4.
   */
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  /** `search` after the typing pause — what actually goes to the server. */
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The filter bar's own values, seeded ONCE from the list screen's active
  // scope: the operator opened the modal from a filtered list, so those filters
  // carry in — and from then on this bar owns them, so they can be widened or
  // narrowed without closing the modal.
  const filterKeys = useMemo(() => new Set(filters.map((f) => f.key)), [filters]);
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      filters.map((f) => [f.key, scope[f.key] == null ? '' : String(scope[f.key])]),
    ),
  );
  const [filterOptions, setFilterOptions] = useState<Record<string, SelectOption[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // One shared fetcher for every master list (§4.10) — it handles the page-size
      // cap and both envelope shapes. Options are NOT sorted here: SearchableSelect
      // puts them in id order (§4.16).
      const loaded = await Promise.all(
        filters.map(async (f) => [
          f.key,
          (await fetchMasterOptions(f.source, f.labelField)).map((o) => ({
            value: String(o.id),
            label: o.label,
          })),
        ] as const),
      );
      if (!cancelled) setFilterOptions(Object.fromEntries(loaded));
    })();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  // Debounced so a search runs once the operator stops typing rather than firing
  // a query per keystroke against a table this size.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const setFilter = useCallback((key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setPage(1); // a narrower set makes the old page number meaningless
  }, []);

  const activeFilterCount =
    Object.values(filterValues).filter(Boolean).length + (debouncedSearch ? 1 : 0);

  const clearFilters = useCallback(() => {
    setFilterValues((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, ''])));
    setSearch('');
    setPage(1);
  }, []);

  // The scope, as a stable string. The list pages pass `scope` as an object
  // literal, so depending on its identity would refetch on every parent render
  // — and with paging that would also snap the operator back to page 1.
  const scopeQuery = useMemo(() => {
    const p = new URLSearchParams({ status_filters: statusFilters.join(',') });
    for (const [k, v] of Object.entries(scope)) {
      // Anything the filter bar owns comes from filterValues instead — otherwise
      // the list screen's value would be pinned on and could not be widened here.
      if (filterKeys.has(k)) continue;
      if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
    }
    for (const [k, v] of Object.entries(filterValues)) if (v) p.set(k, v);
    if (debouncedSearch) p.set('q', debouncedSearch);
    return p.toString();
  }, [statusFilters, scope, filterKeys, filterValues, debouncedSearch]);

  // A narrower result set can leave the current page past the end. The server
  // clamps rather than erroring, so this only keeps the control in step.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    (async () => {
      const res = await safeFetchJson<BulkData>(
        `/api/v1/${module}/bulk-update-data?${scopeQuery}&page=${page}&page_size=${pageSize}`,
      );
      if (cancelled) return;
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.message);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [module, scopeQuery, page, pageSize]);

  const setCell = useCallback((id: number, field: string, value: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }, []);

  // Already narrowed by the server — the filters and the search are part of the
  // query, so what comes back IS the result, across every page.
  const visibleRows = data?.rows ?? [];

  const pendingCount = Object.keys(edits).length;

  const save = useCallback(async () => {
    // Everything edited, across every page visited — not just what is on screen.
    const updates = Object.entries(edits).map(([id, values]) => ({ id: Number(id), values }));
    if (updates.length === 0) {
      setError('Nothing has been changed yet — edit a field before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    const res = await safeFetchJson<{ success_count: number }>(`/api/v1/${module}/bulk-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    onSaved(res.data.success_count);
  }, [module, edits, onSaved]);

  const label = (f: string): string => fieldMeta[f]?.label ?? f;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:p-6"
      onClick={onClose}
    >
      <div className="card my-auto w-full max-w-6xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-brand-gradient px-5 py-4 text-white">
          <h2 className="font-semibold">
            Bulk Update — {statusFilters.length} filter{statusFilters.length === 1 ? '' : 's'}
          </h2>
          <button type="button" onClick={onClose} title="Close" className="rounded-md p-1 hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter bar. Every control here narrows the QUERY, not the loaded page,
            so a result three pages away is still found (§4.9). */}
        <div className="space-y-3 border-b border-border px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-64 pl-9 text-sm"
                placeholder="Search MCA ref, client, horse, trailer, container…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search every matching row"
              />
            </div>

            {filters.map((f) => (
              <SearchableSelect
                key={f.key}
                size="sm"
                className="w-44"
                aria-label={f.label}
                value={filterValues[f.key] ?? ''}
                options={filterOptions[f.key] ?? []}
                emptyLabel={f.emptyLabel}
                placeholder={f.emptyLabel}
                onChange={(v) => setFilter(f.key, v)}
              />
            ))}

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="btn-secondary btn-sm"
                title="Clear the search and every filter"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {data
                ? `${data.total} ${data.total === 1 ? noun.one.toLowerCase() : noun.many.toLowerCase()} match${data.total === 1 ? 'es' : ''} the current filters`
                : ' '}
            </span>
            {/* Says plainly that edits are kept across pages — otherwise an operator
                reasonably assumes turning the page discards what they just typed. */}
            {pendingCount > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                {pendingCount} row{pendingCount === 1 ? '' : 's'} edited — saved together
              </span>
            ) : (
              <span>Edits are kept as you page and filter.</span>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="max-h-[62vh] overflow-auto p-5">
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">Loading rows…</div>
          ) : !data || data.relevant_fields.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No editable fields for the active filters — pick a “pending” status card first.
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              {activeFilterCount > 0
                ? `No ${noun.many.toLowerCase()} match the search and filters — clear them to see the full set.`
                : `No matching ${noun.many.toLowerCase()}.`}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base whitespace-nowrap text-xs">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>MCA Ref</th>
                    <th>Client</th>
                    {leadColumns.map((c) => (
                      <th key={c.header}>{c.header}</th>
                    ))}
                    {data.readonly_fields.map((f) => (
                      <th key={f}>{label(f)}</th>
                    ))}
                    {data.relevant_fields.map((f) => (
                      <th key={f}>{label(f)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, idx) => {
                    const id = row.id as number;
                    const rowEdited = !!edits[id];
                    return (
                      <tr
                        key={id}
                        className={rowEdited ? 'bg-amber-50 dark:bg-amber-500/10' : 'hover:bg-muted/50'}
                      >
                        {/* §4.9 — continues across pages rather than restarting at 1. */}
                        <td className="text-muted-foreground">
                          {(data.page - 1) * data.page_size + idx + 1}
                        </td>
                        <td className="font-mono">{String(row.mca_ref ?? '—')}</td>
                        <td>{String(row.client_name ?? '—')}</td>
                        {leadColumns.map((c) => (
                          <td key={c.header} className="text-muted-foreground">
                            {c.render(row)}
                          </td>
                        ))}
                        {data.readonly_fields.map((f) => (
                          <td key={f} className="text-muted-foreground">
                            {String(row[f] ?? '—')}
                          </td>
                        ))}
                        {data.relevant_fields.map((f) => {
                          const stored = row[f];
                          const shown =
                            edits[id]?.[f] ??
                            (stored === null || stored === undefined ? '' : String(stored));
                          return (
                            <td key={f}>
                              <input
                                type={inputType(fieldMeta[f]?.type)}
                                step={fieldMeta[f]?.type === 'number' ? '0.01' : undefined}
                                value={shown}
                                onChange={(e) => setCell(id, f, e.target.value)}
                                className={`input w-40 px-2 py-1 text-xs ${
                                  edits[id]?.[f] !== undefined ? 'border-amber-500' : ''
                                }`}
                                aria-label={`${label(f)} for ${String(row.mca_ref ?? id)}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* §4.9 — the shared footer, so paging here looks and behaves like paging
            on every list screen. */}
        {data && data.total > 0 && (
          <div className="px-5">
            <PaginationFooter
              page={data.page}
              pageSize={data.page_size}
              totalRows={data.total}
              totalPages={data.total_pages}
              startIndex={(data.page - 1) * data.page_size}
              mounted
              setPage={setPage}
              setPageSize={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
          </div>
        )}

        {/* §4.21 — a labelled way out, in every mode. */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading || pendingCount === 0}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save{' '}
            {pendingCount > 0
              ? `${pendingCount} ${pendingCount === 1 ? noun.one : noun.many}`
              : 'Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
